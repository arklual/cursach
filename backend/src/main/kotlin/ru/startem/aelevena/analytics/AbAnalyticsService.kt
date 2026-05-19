package ru.startem.aelevena.analytics

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.workflow.WorkflowService
import java.time.OffsetDateTime
import java.util.UUID

@Service
class AbAnalyticsService(
    private val workflowService: WorkflowService,
    private val repo: AbAnalyticsRepository,
    private val mapper: ObjectMapper,
) {
    // Тот же массив, что и на фронте (workflow-canvas.component.ts: variantPalette).
    private val palette = listOf("#84cc16", "#3b82f6", "#f472b6", "#fb923c", "#a78bfa")

    data class ConfigVariant(val key: String, val label: String, val weight: Int?)

    fun compute(workflowId: UUID, abNodeId: String): AbAnalyticsResponse {
        // 1) Валидация: workflow + nodes + type=branch.split.
        val workflow = workflowService.getWorkflow(workflowId) // 404 если нет
        val node = workflow.graph.nodes.firstOrNull { it.id == abNodeId }
            ?: throw NotFoundException("node not found in workflow")
        if (node.type != "branch.split") {
            throw BadRequestException("node is not an A/B split")
        }

        // 2) Variants из config (JsonNode). Если нет — дефолтный A/B 50/50.
        val cfg: JsonNode? = node.data?.config
        val mode = cfg?.path("mode")?.asText("split").orDefault("split")
        val configVariants: List<ConfigVariant> = parseConfigVariants(cfg)

        // 3) Сырые данные из БД.
        val rows = repo.findVariantRows(workflowId, abNodeId)
        val excludedDb = repo.countRunsWithoutAbNode(workflowId, abNodeId)

        // 4) Парсинг output_json по mode → counters.
        val parsed = parseRows(rows, mode)

        // 5) Сборка строк ответа с агрегацией + stat-test.
        val warnings = mutableListOf<String>()
        val totalTraffic = parsed.trafficCountsByVariant.values.sum().coerceAtLeast(1)

        val baselineKey = configVariants.firstOrNull()?.key
        val baselineRuns = parsed.runsByVariant[baselineKey] ?: 0
        val baselineSucc = parsed.successesByVariant[baselineKey] ?: 0

        val knownKeys = configVariants.map { it.key }.toSet()
        val unknownKeys = (parsed.runsByVariant.keys + parsed.trafficCountsByVariant.keys) - knownKeys
        unknownKeys.forEach { warnings.add("Variant '$it' встречается в runs, но отсутствует в текущем config") }

        val configRows = configVariants.mapIndexed { i, v ->
            val color = palette[i % palette.size]
            buildRow(
                key = v.key, label = v.label.ifEmpty { v.key }, color = color, weight = v.weight,
                isBaseline = (v.key == baselineKey),
                parsed = parsed,
                totalTraffic = totalTraffic,
                mode = mode,
                baselineRuns = baselineRuns,
                baselineSucc = baselineSucc,
                warnings = warnings,
            )
        }

        val unknownRows = unknownKeys.map { key ->
            buildRow(
                key = key, label = key, color = "#6b7280", weight = null,
                isBaseline = false,
                parsed = parsed,
                totalTraffic = totalTraffic,
                mode = mode,
                baselineRuns = baselineRuns,
                baselineSucc = baselineSucc,
                warnings = warnings,
            )
        }

        return AbAnalyticsResponse(
            abNodeId = abNodeId,
            mode = mode,
            totalRuns = rows.size,
            excludedNoVariant = excludedDb + parsed.invalidOutputCount,
            computedAt = OffsetDateTime.now(),
            variants = configRows + unknownRows,
            warnings = warnings,
        )
    }

    private fun String?.orDefault(default: String): String =
        if (this.isNullOrBlank()) default else this

    private fun parseConfigVariants(cfg: JsonNode?): List<ConfigVariant> {
        val arr = cfg?.path("variants")
        if (arr == null || !arr.isArray || arr.size() == 0) {
            return listOf(
                ConfigVariant("A", "Control", 50),
                ConfigVariant("B", "Treatment", 50),
            )
        }
        return arr.mapNotNull { node ->
            val key = node.path("key").asText(null) ?: return@mapNotNull null
            val label = node.path("label").asText(key)
            val weight = if (node.has("weight") && node.path("weight").isNumber)
                node.path("weight").asInt() else null
            ConfigVariant(key, label, weight)
        }
    }

    private data class Parsed(
        val runsByVariant: Map<String, Int>,       // pick: 1 run = 1 variant; split: всегда пусто
        val successesByVariant: Map<String, Int>,  // только pick
        val trafficCountsByVariant: Map<String, Int>, // pick: = runsByVariant; split: сумма length массивов
        val invalidOutputCount: Int,               // строки с невалидным output_json
    )

    private fun parseRows(rows: List<AbAnalyticsRepository.VariantRow>, mode: String): Parsed {
        val runsBy = mutableMapOf<String, Int>()
        val succBy = mutableMapOf<String, Int>()
        val trafficBy = mutableMapOf<String, Int>()
        var invalid = 0

        for (row in rows) {
            val json: JsonNode = try {
                mapper.readTree(row.abOutputJson ?: "")
            } catch (_: Exception) {
                invalid++; continue
            }
            when (mode) {
                "pick" -> {
                    val chosen = json.path("meta").path("chosen").asText(null)
                    if (chosen == null || chosen.isBlank()) {
                        invalid++; continue
                    }
                    runsBy.merge(chosen, 1, Int::plus)
                    trafficBy.merge(chosen, 1, Int::plus)
                    if (row.runStatus == "success") {
                        succBy.merge(chosen, 1, Int::plus)
                    }
                }
                "split" -> {
                    val variants = json.path("variants")
                    if (!variants.isObject) {
                        invalid++; continue
                    }
                    var hadAny = false
                    variants.fieldNames().forEach { key ->
                        val arr = variants.path(key)
                        val n = if (arr.isArray) arr.size() else 0
                        if (n > 0) {
                            trafficBy.merge(key, n, Int::plus)
                            hadAny = true
                        }
                    }
                    if (!hadAny) invalid++
                }
                else -> {
                    invalid++
                }
            }
        }
        return Parsed(runsBy, succBy, trafficBy, invalid)
    }

    private fun buildRow(
        key: String, label: String, color: String, weight: Int?, isBaseline: Boolean,
        parsed: Parsed, totalTraffic: Int, mode: String,
        baselineRuns: Int, baselineSucc: Int,
        warnings: MutableList<String>,
    ): AbVariantRow {
        val traffic = parsed.trafficCountsByVariant[key] ?: 0
        val runs = parsed.runsByVariant[key] ?: 0
        val succ = parsed.successesByVariant[key] ?: 0

        return if (mode == "pick") {
            val convPct = if (runs > 0) 100.0 * succ / runs else null
            val ci = StatTest.waldCi(succ, runs)
            val z = if (!isBaseline) {
                StatTest.twoProportionZ(baselineSucc, baselineRuns, succ, runs)
            } else null
            val lift = if (!isBaseline && convPct != null && baselineRuns > 0) {
                convPct - 100.0 * baselineSucc / baselineRuns
            } else null
            val sigEligible = !isBaseline && runs >= 30 && baselineRuns >= 30
            val isSig = sigEligible && (z?.pValue != null) && z.pValue < 0.05
            if (!isBaseline && (runs < 30 || baselineRuns < 30)) {
                warnings.add("Variant '$key': недостаточная выборка для p-value (n<30)")
            }
            AbVariantRow(
                key = key, label = label, color = color, weight = weight,
                runs = runs, trafficCount = traffic,
                trafficPct = 100.0 * traffic / totalTraffic,
                conversions = succ, conversionPct = convPct,
                ciLow = ci.low?.let { it * 100.0 },
                ciHigh = ci.high?.let { it * 100.0 },
                liftVsBaseline = lift,
                pValue = z?.pValue,
                isBaseline = isBaseline,
                isSignificant = isSig,
            )
        } else {
            // split: только traffic, никакой конверсии
            AbVariantRow(
                key = key, label = label, color = color, weight = weight,
                runs = 0, trafficCount = traffic,
                trafficPct = 100.0 * traffic / totalTraffic,
                conversions = null, conversionPct = null,
                ciLow = null, ciHigh = null,
                liftVsBaseline = null, pValue = null,
                isBaseline = isBaseline,
                isSignificant = false,
            )
        }
    }
}
