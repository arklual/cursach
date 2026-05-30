package ru.startem.aelevena.analytics

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
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
    private val palette = listOf("#84cc16", "#3b82f6", "#f472b6", "#fb923c", "#a78bfa")

    data class ConfigVariant(val key: String, val label: String, val weight: Int?)

    @Transactional(readOnly = true)
    fun compute(workflowId: UUID, abNodeId: String): AbAnalyticsResponse {
        val workflow = workflowService.getWorkflow(workflowId)
        val node = workflow.graph.nodes.firstOrNull { it.id == abNodeId }
            ?: throw NotFoundException("node not found in workflow")
        if (node.type != "branch.split") {
            throw BadRequestException("node is not an A/B split")
        }

        val cfg: JsonNode? = node.data?.config
        val mode = (cfg?.path("mode")?.asText("split") ?: "split").ifBlank { "split" }
        val configVariants: List<ConfigVariant> = parseConfigVariants(cfg)

        val rows = repo.findVariantRows(workflowId, abNodeId)
        val excludedDb = repo.countRunsWithoutAbNode(workflowId, abNodeId)

        val warnings = mutableListOf<String>()
        if (mode != "pick" && mode != "split") {
            warnings.add("Неизвестный mode ab-ноды: '$mode' (ожидался 'pick' или 'split')")
        }

        val parsed = parseRows(rows, mode)

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
        val runsByVariant: Map<String, Int>,
        val successesByVariant: Map<String, Int>,
        val trafficCountsByVariant: Map<String, Int>,
        val invalidOutputCount: Int,
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
                    val chosen = json.path("chosen").asText(null)
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
                    variants.fieldNames().forEach { key ->
                        val arr = variants.path(key)
                        val n = if (arr.isArray) arr.size() else 0
                        if (n > 0) {
                            trafficBy.merge(key, n, Int::plus)
                        }
                    }
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
