# A/B-аналитика per-workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать чтение аналитики по выбранной A/B (ab-) ноде workflow: распределение трафика по вариантам + конверсия (run.status='success') + p-value (two-proportion z-test vs baseline). Без миграций БД, без новых зависимостей.

**Architecture:** Read-only сервис на бэке (`AbAnalyticsService`) парсит `node_run.output_json` выбранной ab-ноды (для каждого `workflow_run`) и агрегирует по `variant`. Один endpoint `GET /workflows/{workflowId}/ab-analytics?abNodeId={id}`. Фронт — новая вкладка `«Аналитика»` в нижней панели редактора рядом с «Логи»/«Запуски», `AnalyticsPanelComponent` с CSS-bars (без chart.js).

**Tech Stack:** Backend — Kotlin 2.2, Spring Boot 4.0, Spring JDBC (`NamedParameterJdbcTemplate`), Jackson, JUnit 5, Testcontainers. Frontend — Angular 19.2, TypeScript 5.6, Signals, RxJS, Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-05-19-ab-analytics-design.md` — обязательно к прочтению перед началом.

---

## File map

### Create
- `backend/src/main/kotlin/ru/startem/aelevena/analytics/StatTest.kt` — чистые функции `normalCdf`, `twoProportionZ`, `waldCi`.
- `backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsDtos.kt` — request/response типы.
- `backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsRepository.kt` — два JDBC-запроса.
- `backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsService.kt` — оркестрация (валидация, парсинг JSON, агрегация, stat-test).
- `backend/src/main/kotlin/ru/startem/aelevena/api/AbAnalyticsController.kt` — REST endpoint.
- `backend/src/test/kotlin/ru/startem/aelevena/analytics/StatTestTest.kt` — табличные кейсы.
- `backend/src/test/kotlin/ru/startem/aelevena/analytics/AbAnalyticsServiceTest.kt` — интеграция с Testcontainers (по образцу `WorkflowExecutionServiceBranchTest`).
- `backend/src/test/kotlin/ru/startem/aelevena/api/AbAnalyticsControllerTest.kt` — интеграция (валидация ошибок + happy path).
- `frontend/src/app/core/api/analytics.api.ts` — Angular service.
- `frontend/src/app/components/analytics-panel/analytics-panel.component.ts` — UI.
- `frontend/src/app/components/analytics-panel/analytics-panel.component.spec.ts` — smoke spec.

### Modify
- `backend/swagger.yaml` — добавить путь `/workflows/{workflowId}/ab-analytics` и схемы.
- `frontend/src/app/core/api/api.models.ts` — добавить алиасы `AbAnalyticsResponse`, `AbVariantRow`.
- `frontend/src/app/core/api/api.types.ts` — авто-регенерируется через `npm run gen:api` (НЕ редактировать вручную).
- `frontend/src/app/pages/workflow-editor/workflow-editor.component.ts` — расширить `bottomTab` до `'log' | 'runs' | 'analytics'`, добавить кнопку вкладки и `@if`-блок с `<app-analytics-panel>`, импорт компонента.

---

## Task 1: StatTest utility — чистые функции

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/analytics/StatTest.kt`
- Test: `backend/src/test/kotlin/ru/startem/aelevena/analytics/StatTestTest.kt`

- [ ] **Step 1: Создать failing-тест**

```kotlin
// backend/src/test/kotlin/ru/startem/aelevena/analytics/StatTestTest.kt
package ru.startem.aelevena.analytics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import kotlin.math.abs

class StatTestTest {
    private fun assertNear(expected: Double, actual: Double, eps: Double = 1e-3) {
        assert(abs(expected - actual) < eps) { "expected $expected, got $actual (diff=${abs(expected - actual)})" }
    }

    @Test
    fun `normalCdf returns 0_5 at 0`() {
        assertNear(0.5, StatTest.normalCdf(0.0))
    }

    @Test
    fun `normalCdf at 1_96 is about 0_975`() {
        assertNear(0.975, StatTest.normalCdf(1.96))
    }

    @Test
    fun `normalCdf at minus 1_96 is about 0_025`() {
        assertNear(0.025, StatTest.normalCdf(-1.96))
    }

    @Test
    fun `twoProportionZ returns p value 1_0 when proportions equal`() {
        val result = StatTest.twoProportionZ(succA = 50, nA = 100, succB = 50, nB = 100)
        assertEquals(0.0, result.z, 1e-9)
        assertNear(1.0, result.pValue)
    }

    @Test
    fun `twoProportionZ large difference gives p value below 0_001`() {
        val result = StatTest.twoProportionZ(succA = 90, nA = 100, succB = 50, nB = 100)
        assert(result.pValue < 0.001) { "expected p<0.001, got ${result.pValue}" }
        assert(result.z > 6.0) { "expected z>6, got ${result.z}" }
    }

    @Test
    fun `twoProportionZ classic 50 vs 60 of 100 returns p around 0_155`() {
        val result = StatTest.twoProportionZ(succA = 50, nA = 100, succB = 60, nB = 100)
        assertNear(0.155, result.pValue, 0.005)
    }

    @Test
    fun `twoProportionZ returns null pValue for zero sample`() {
        val result = StatTest.twoProportionZ(succA = 0, nA = 0, succB = 5, nB = 10)
        assertEquals(null, result.pValue)
    }

    @Test
    fun `waldCi for p_0_5 n_100 is around 0_402 to 0_598`() {
        val ci = StatTest.waldCi(successes = 50, total = 100, z = 1.96)
        assertNear(0.402, ci.low, 0.005)
        assertNear(0.598, ci.high, 0.005)
    }

    @Test
    fun `waldCi clips to 0_1 range for extreme proportions`() {
        val ci = StatTest.waldCi(successes = 100, total = 100, z = 1.96)
        assertEquals(1.0, ci.high)
    }

    @Test
    fun `waldCi returns null for zero n`() {
        val ci = StatTest.waldCi(successes = 0, total = 0, z = 1.96)
        assertEquals(null, ci.low)
        assertEquals(null, ci.high)
    }
}
```

- [ ] **Step 2: Запустить тест и убедиться, что он не компилится**

Run: `(cd backend && ./mvnw test -Dtest=StatTestTest -q)`
Expected: COMPILATION ERROR — `Unresolved reference: StatTest`.

- [ ] **Step 3: Минимальная реализация StatTest**

```kotlin
// backend/src/main/kotlin/ru/startem/aelevena/analytics/StatTest.kt
package ru.startem.aelevena.analytics

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sqrt

/** Чистые статистические функции, использующиеся в A/B-аналитике. */
object StatTest {
    data class ZResult(val z: Double, val pValue: Double?)
    data class Ci(val low: Double?, val high: Double?)

    /**
     * Two-proportion z-test (двусторонний). Возвращает z и двустороннее p-value.
     * Если объём любой группы 0 — pValue=null (тест не определён).
     */
    fun twoProportionZ(succA: Int, nA: Int, succB: Int, nB: Int): ZResult {
        if (nA == 0 || nB == 0) return ZResult(z = 0.0, pValue = null)
        val pA = succA.toDouble() / nA
        val pB = succB.toDouble() / nB
        val pooled = (succA + succB).toDouble() / (nA + nB)
        val se = sqrt(pooled * (1.0 - pooled) * (1.0 / nA + 1.0 / nB))
        if (se == 0.0) {
            return ZResult(z = 0.0, pValue = 1.0)
        }
        val z = (pB - pA) / se
        val pValue = 2.0 * (1.0 - normalCdf(abs(z)))
        return ZResult(z = z, pValue = pValue.coerceIn(0.0, 1.0))
    }

    /**
     * Wald 95% (по умолчанию) CI для биномиальной пропорции.
     * Возвращает (low, high) в долях [0, 1]; null если n=0.
     */
    fun waldCi(successes: Int, total: Int, z: Double = 1.96): Ci {
        if (total == 0) return Ci(low = null, high = null)
        val p = successes.toDouble() / total
        val half = z * sqrt(p * (1.0 - p) / total)
        return Ci(
            low = (p - half).coerceIn(0.0, 1.0),
            high = (p + half).coerceIn(0.0, 1.0),
        )
    }

    /**
     * CDF стандартного нормального распределения.
     * Аппроксимация Abramowitz & Stegun 26.2.17, точность ~7.5e-8.
     */
    fun normalCdf(x: Double): Double {
        val a1 = 0.254829592
        val a2 = -0.284496736
        val a3 = 1.421413741
        val a4 = -1.453152027
        val a5 = 1.061405429
        val p = 0.3275911

        val sign = if (x < 0) -1.0 else 1.0
        val absX = abs(x) / sqrt(2.0)
        val t = 1.0 / (1.0 + p * absX)
        val y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * exp(-absX * absX)
        return 0.5 * (1.0 + sign * y)
    }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что прошёл**

Run: `(cd backend && ./mvnw test -Dtest=StatTestTest -q)`
Expected: `Tests run: 10, Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/analytics/StatTest.kt \
        backend/src/test/kotlin/ru/startem/aelevena/analytics/StatTestTest.kt
git commit -m "feat(analytics): StatTest — normalCdf, twoProportionZ, waldCi (TDD)"
```

---

## Task 2: AbAnalyticsDtos — response/row типы

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsDtos.kt`

- [ ] **Step 1: Создать файл DTO**

```kotlin
// backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsDtos.kt
package ru.startem.aelevena.analytics

import java.time.OffsetDateTime

data class AbAnalyticsResponse(
    val abNodeId: String,
    val mode: String,                 // "pick" | "split"
    val totalRuns: Int,
    val excludedNoVariant: Int,
    val computedAt: OffsetDateTime,
    val variants: List<AbVariantRow>,
    val warnings: List<String>,
)

data class AbVariantRow(
    val key: String,
    val label: String,
    val color: String,
    val weight: Int?,
    val runs: Int,
    val trafficCount: Int,
    val trafficPct: Double,
    val conversions: Int?,
    val conversionPct: Double?,
    val ciLow: Double?,
    val ciHigh: Double?,
    val liftVsBaseline: Double?,
    val pValue: Double?,
    val isBaseline: Boolean,
    val isSignificant: Boolean,
)
```

- [ ] **Step 2: Убедиться, что компилируется**

Run: `(cd backend && ./mvnw compile -q)`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsDtos.kt
git commit -m "feat(analytics): DTO для AbAnalytics response"
```

---

## Task 3: AbAnalyticsRepository — два JDBC-запроса

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsRepository.kt`

Тест на репозиторий отдельно не пишем — покрытие даст `AbAnalyticsServiceTest` (Task 5), который ходит через сервис в реальную БД.

- [ ] **Step 1: Создать репозиторий**

```kotlin
// backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsRepository.kt
package ru.startem.aelevena.analytics

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class AbAnalyticsRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    /** Одна строка соответствует одному завершённому workflow_run с успешно выполненной ab-нодой. */
    data class VariantRow(
        val runId: Long,
        val runStatus: String,     // "success" | "failed"
        val abOutputJson: String?, // raw jsonb output_json у ab-ноды
    )

    fun findVariantRows(workflowId: UUID, abNodeId: String): List<VariantRow> {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("abNodeId", abNodeId)
        return jdbc.query(
            """
            select wr.id as run_id, wr.status as run_status, nr.output_json::text as ab_output
            from workflow_run wr
            join node_run nr
              on nr.workflow_run_id = wr.id
             and nr.node_id = :abNodeId
            where wr.workflow_id = :workflowId
              and wr.status in ('success', 'failed')
              and nr.status = 'success'
            """.trimIndent(),
            params,
        ) { rs, _ ->
            VariantRow(
                runId = rs.getLong("run_id"),
                runStatus = rs.getString("run_status"),
                abOutputJson = rs.getString("ab_output"),
            )
        }
    }

    /** Сколько завершённых runs не имеют успешного node_run у ab-ноды (вариант неизвестен). */
    fun countRunsWithoutAbNode(workflowId: UUID, abNodeId: String): Int {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("abNodeId", abNodeId)
        return jdbc.queryForObject(
            """
            select count(*)
            from workflow_run wr
            where wr.workflow_id = :workflowId
              and wr.status in ('success', 'failed')
              and not exists (
                select 1 from node_run nr
                where nr.workflow_run_id = wr.id
                  and nr.node_id = :abNodeId
                  and nr.status = 'success'
              )
            """.trimIndent(),
            params,
            Int::class.java,
        ) ?: 0
    }
}
```

- [ ] **Step 2: Убедиться, что компилируется**

Run: `(cd backend && ./mvnw compile -q)`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsRepository.kt
git commit -m "feat(analytics): репозиторий для чтения variant-rows и excluded count"
```

---

## Task 4: AbAnalyticsService — оркестрация

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsService.kt`

> **Важно про domain mapping:**
> Frontend использует строку kind `"ab"` для split-ноды и `"join"` для merge. Backend в DTO `Node.type` использует **`"branch.split"`** и **`"branch.merge"`** (см. `WorkflowExecutionServiceBranchTest`). Сервис проверяет `node.type == "branch.split"`.
> `NodeData` = `(label: String?, config: JsonNode?, abConfig: JsonNode?)` — config это `JsonNode`, не `Map`.

- [ ] **Step 1: Реализация сервиса**

```kotlin
// backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsService.kt
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
```

- [ ] **Step 2: Убедиться, что компилируется**

Run: `(cd backend && ./mvnw compile -q)`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/analytics/AbAnalyticsService.kt
git commit -m "feat(analytics): AbAnalyticsService — агрегация + stat-test"
```

---

## Task 5: AbAnalyticsServiceTest — интеграция с Testcontainers

**Files:**
- Create: `backend/src/test/kotlin/ru/startem/aelevena/analytics/AbAnalyticsServiceTest.kt`

Опираемся на готовую `MvpIntegrationTests.ContainersConfig` (postgres + minio) и помощников `WorkflowService`/`RunEnqueueService` (см. `WorkflowExecutionServiceBranchTest`).

- [ ] **Step 1: Каркас теста — построить workflow с ab-нодой и убедиться, что 0 runs → пустой ответ**

```kotlin
// backend/src/test/kotlin/ru/startem/aelevena/analytics/AbAnalyticsServiceTest.kt
package ru.startem.aelevena.analytics

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.run.WorkflowRunRepository
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Duration
import java.util.UUID

@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = ["app.seed.demo-workflows-enabled=false"],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ru.startem.aelevena.MvpIntegrationTests.ContainersConfig::class)
class AbAnalyticsServiceTest {

    companion object {
        @Container
        val minio: GenericContainer<*> = GenericContainer("minio/minio:latest")
            .withEnv("MINIO_ROOT_USER", "minioadmin")
            .withEnv("MINIO_ROOT_PASSWORD", "minioadmin")
            .withCommand("server /data --console-address :9001")
            .withExposedPorts(9000)
            .withStartupTimeout(Duration.ofSeconds(60))

        @JvmStatic
        @DynamicPropertySource
        fun minioProperties(registry: DynamicPropertyRegistry) {
            minio.start()
            registry.add("app.s3.endpoint") { "http://localhost:${minio.getMappedPort(9000)}" }
            registry.add("app.s3.region") { "us-east-1" }
            registry.add("app.s3.bucket") { "a11a-blobs" }
            registry.add("app.s3.access-key") { "minioadmin" }
            registry.add("app.s3.secret-key") { "minioadmin" }
            registry.add("app.s3.path-style-access") { "true" }
        }
    }

    @Autowired private lateinit var workflowService: WorkflowService
    @Autowired private lateinit var runEnqueueService: RunEnqueueService
    @Autowired private lateinit var workflowRunRepository: WorkflowRunRepository
    @Autowired private lateinit var service: AbAnalyticsService
    @Autowired private lateinit var mapper: ObjectMapper

    @Test
    fun `compute returns empty variants when no runs`() {
        val (workflowId, abNodeId) = createWorkflowWithPickAb()
        val response = service.compute(workflowId, abNodeId)
        assertEquals(0, response.totalRuns)
        assertEquals(0, response.excludedNoVariant)
        assertEquals(2, response.variants.size)
        assertEquals(0, response.variants[0].runs)
    }

    /**
     * Создаёт workflow Trigger → AB(pick, attribute-strategy by country) → Pass A / Pass B → Merge.
     * Стратегия `attribute` (а не `random`) — даёт детерминированное распределение и упрощает asserts.
     * Возвращает (workflowId, abNodeId).
     */
    private fun createWorkflowWithPickAb(): Pair<UUID, String> {
        val created = workflowService.createWorkflow(
            WorkflowCreateRequest(name = "ab-analytics-test-${UUID.randomUUID()}")
        )
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = mapper.readTree(
            """
            {
              "mode": "pick",
              "strategy": "attribute",
              "variants": [
                {"key": "A", "label": "RU branch",    "weight": 1},
                {"key": "B", "label": "Other branch", "weight": 1}
              ],
              "rules": [
                {"variant": "A", "field": "country", "op": "eq", "value": "RU"}
              ],
              "defaultVariant": "B"
            }
            """.trimIndent()
        )
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0),
                    data = NodeData(label = "Pass A")),
                Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0),
                    data = NodeData(label = "Pass B")),
                Node(id = "merge", type = "branch.merge", position = Position(2.0, 0.5),
                    data = NodeData(label = "Merge")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
                Connection(id = "e-split-b", source = "split", target = "passB", variant = "B"),
                Connection(id = "e-a-merge", source = "passA", target = "merge"),
                Connection(id = "e-b-merge", source = "passB", target = "merge"),
            ),
        )
        workflowService.updateGraph(versionId, graph)
        return workflowId to "split"
    }
}
```

- [ ] **Step 2: Запустить тест и убедиться, что прошёл**

Run: `(cd backend && ./mvnw test -Dtest=AbAnalyticsServiceTest#compute*returns*empty* -q)`
Expected: `Tests run: 1, Failures: 0, Errors: 0`.

- [ ] **Step 3: Добавить тест на pick-mode с реальным распределением**

Дописать в `AbAnalyticsServiceTest`:

```kotlin
    @Test
    fun `compute aggregates pick-mode traffic and conversion`() {
        val (workflowId, abNodeId) = createWorkflowWithPickAb()

        // 6 runs с country=RU → variant A; 4 runs с country=US → variant B.
        // Все ноды (foreach с дефолтным input) завершаются success → все runs success.
        repeat(6) {
            val runId = runEnqueueService.enqueue(workflowId, mapper.readTree("""[{"country":"RU"}]"""))
            waitForFinish(runId)
        }
        repeat(4) {
            val runId = runEnqueueService.enqueue(workflowId, mapper.readTree("""[{"country":"US"}]"""))
            waitForFinish(runId)
        }

        val response = service.compute(workflowId, abNodeId)
        assertEquals(10, response.totalRuns)
        assertEquals(0, response.excludedNoVariant)
        assertEquals(2, response.variants.size)

        val rowA = response.variants.first { it.key == "A" }
        val rowB = response.variants.first { it.key == "B" }
        assertEquals(6, rowA.runs)
        assertEquals(4, rowB.runs)
        assertEquals(true, rowA.isBaseline)   // первый в config
        assertEquals(false, rowB.isBaseline)
        assertNotNull(rowA.conversionPct)
        assertNotNull(rowB.conversionPct)
        // Все runs success → conversion 100% у обоих.
        assertEquals(100.0, rowA.conversionPct!!, 0.01)
        assertEquals(100.0, rowB.conversionPct!!, 0.01)
        // lift = 0pp, p-value = 1.0 (равные пропорции 100%/100%).
        assertEquals(0.0, rowB.liftVsBaseline!!, 0.01)
    }

    private fun waitForFinish(runId: Long, timeoutMs: Long = 10_000) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val row = workflowRunRepository.findById(runId) ?: error("run $runId not found")
            if (row.status == "success" || row.status == "failed") return
            Thread.sleep(50)
        }
        error("run $runId did not finish within ${timeoutMs}ms")
    }
```

- [ ] **Step 4: Запустить новый тест**

Run: `(cd backend && ./mvnw test -Dtest=AbAnalyticsServiceTest#compute*aggregates* -q)`
Expected: PASS. Если стабильно не выходит распределение по обоим вариантам — добавить детерминизм (например, прибить `weights` к 100/0 для одного из прогонов).

- [ ] **Step 5: Добавить тест split-mode**

Дописать в `AbAnalyticsServiceTest`:

```kotlin
    @Test
    fun `compute returns null conversion for split-mode`() {
        val (workflowId, abNodeId) = createWorkflowWithSplitAb()

        val input = mapper.readTree("""[{"u":1},{"u":2},{"u":3},{"u":4},{"u":5},{"u":6},{"u":7},{"u":8}]""")
        val runId = runEnqueueService.enqueue(workflowId, input)
        waitForFinish(runId)

        val response = service.compute(workflowId, abNodeId)
        assertEquals("split", response.mode)
        assertEquals(1, response.totalRuns)
        response.variants.forEach { v ->
            assertEquals(null, v.conversionPct)
            assertEquals(null, v.pValue)
        }
        // Суммарно traffic = 8 (длина исходного массива).
        assertEquals(8, response.variants.sumOf { it.trafficCount })
    }

    private fun createWorkflowWithSplitAb(): Pair<UUID, String> {
        val created = workflowService.createWorkflow(
            WorkflowCreateRequest(name = "ab-split-analytics-${UUID.randomUUID()}")
        )
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = mapper.readTree(
            """
            {
              "mode": "split",
              "strategy": "random",
              "seed": 42,
              "variants": [
                {"key": "A", "label": "Branch A", "weight": 1},
                {"key": "B", "label": "Branch B", "weight": 1}
              ]
            }
            """.trimIndent()
        )
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0),
                    data = NodeData(label = "Pass A")),
                Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0),
                    data = NodeData(label = "Pass B")),
                Node(id = "merge", type = "branch.merge", position = Position(2.0, 0.5),
                    data = NodeData(label = "Merge")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
                Connection(id = "e-split-b", source = "split", target = "passB", variant = "B"),
                Connection(id = "e-a-merge", source = "passA", target = "merge"),
                Connection(id = "e-b-merge", source = "passB", target = "merge"),
            ),
        )
        workflowService.updateGraph(versionId, graph)
        return workflowId to "split"
    }
```

- [ ] **Step 6: Запустить новый тест**

Run: `(cd backend && ./mvnw test -Dtest=AbAnalyticsServiceTest#compute*split* -q)`
Expected: PASS.

- [ ] **Step 7: Запустить весь класс**

Run: `(cd backend && ./mvnw test -Dtest=AbAnalyticsServiceTest -q)`
Expected: `Tests run: 3, Failures: 0, Errors: 0`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/test/kotlin/ru/startem/aelevena/analytics/AbAnalyticsServiceTest.kt
git commit -m "test(analytics): интеграционные тесты сервиса (pick, split, empty)"
```

---

## Task 6: AbAnalyticsController + endpoint test

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/api/AbAnalyticsController.kt`
- Create: `backend/src/test/kotlin/ru/startem/aelevena/api/AbAnalyticsControllerTest.kt`

- [ ] **Step 1: Контроллер**

```kotlin
// backend/src/main/kotlin/ru/startem/aelevena/api/AbAnalyticsController.kt
package ru.startem.aelevena.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.analytics.AbAnalyticsResponse
import ru.startem.aelevena.analytics.AbAnalyticsService
import java.util.UUID

@RestController
class AbAnalyticsController(
    private val service: AbAnalyticsService,
) {
    @GetMapping("/workflows/{workflowId}/ab-analytics")
    fun get(
        @PathVariable workflowId: UUID,
        @RequestParam(required = true) abNodeId: String,
    ): AbAnalyticsResponse {
        if (abNodeId.isBlank()) throw BadRequestException("abNodeId is required")
        return service.compute(workflowId, abNodeId)
    }
}
```

- [ ] **Step 2: Тест контроллера — happy path + 400/404**

```kotlin
// backend/src/test/kotlin/ru/startem/aelevena/api/AbAnalyticsControllerTest.kt
package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.GenericContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Duration
import java.util.UUID

@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.MOCK,
    properties = ["app.seed.demo-workflows-enabled=false"],
)
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ru.startem.aelevena.MvpIntegrationTests.ContainersConfig::class)
class AbAnalyticsControllerTest {

    companion object {
        @Container
        val minio: GenericContainer<*> = GenericContainer("minio/minio:latest")
            .withEnv("MINIO_ROOT_USER", "minioadmin")
            .withEnv("MINIO_ROOT_PASSWORD", "minioadmin")
            .withCommand("server /data --console-address :9001")
            .withExposedPorts(9000)
            .withStartupTimeout(Duration.ofSeconds(60))

        @JvmStatic
        @DynamicPropertySource
        fun minioProperties(registry: DynamicPropertyRegistry) {
            minio.start()
            registry.add("app.s3.endpoint") { "http://localhost:${minio.getMappedPort(9000)}" }
            registry.add("app.s3.region") { "us-east-1" }
            registry.add("app.s3.bucket") { "a11a-blobs" }
            registry.add("app.s3.access-key") { "minioadmin" }
            registry.add("app.s3.secret-key") { "minioadmin" }
            registry.add("app.s3.path-style-access") { "true" }
        }
    }

    @Autowired private lateinit var mockMvc: MockMvc
    @Autowired private lateinit var workflowService: WorkflowService
    @Autowired private lateinit var mapper: ObjectMapper

    @Test
    fun `returns 200 with empty variants when no runs`() {
        val (workflowId, abNodeId) = createWorkflowWithAb()
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId={n}", workflowId, abNodeId))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.abNodeId").value(abNodeId))
            .andExpect(jsonPath("$.totalRuns").value(0))
            .andExpect(jsonPath("$.variants.length()").value(2))
    }

    @Test
    fun `returns 404 when workflow not found`() {
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId=split", UUID.randomUUID()))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `returns 404 when node not found in workflow`() {
        val (workflowId, _) = createWorkflowWithAb()
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId=does-not-exist", workflowId))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `returns 400 when node is not ab`() {
        val (workflowId, _) = createWorkflowWithAb()
        // foreach-нода с id "passA" гарантированно не-ab (см. createWorkflowWithAb)
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId=passA", workflowId))
            .andExpect(status().isBadRequest)
    }

    private fun createWorkflowWithAb(): Pair<UUID, String> {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "ctrl-test-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = mapper.readTree(
            """
            {
              "mode": "pick",
              "strategy": "random",
              "userIdField": "u",
              "variants": [
                {"key": "A", "label": "Control",   "weight": 50},
                {"key": "B", "label": "Treatment", "weight": 50}
              ]
            }
            """.trimIndent()
        )
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0),
                    data = NodeData(label = "Pass A")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
            ),
        )
        workflowService.updateGraph(versionId, graph)
        return workflowId to "split"
    }
}
```

- [ ] **Step 3: Запустить тесты**

Run: `(cd backend && ./mvnw test -Dtest=AbAnalyticsControllerTest -q)`
Expected: `Tests run: 4, Failures: 0, Errors: 0`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/api/AbAnalyticsController.kt \
        backend/src/test/kotlin/ru/startem/aelevena/api/AbAnalyticsControllerTest.kt
git commit -m "feat(api): AbAnalyticsController + интеграционные тесты"
```

---

## Task 7: Swagger контракт + регенерация типов фронта

**Files:**
- Modify: `backend/swagger.yaml`
- Auto: `frontend/src/app/core/api/api.types.ts` (через `npm run gen:api`)
- Modify: `frontend/src/app/core/api/api.models.ts`

- [ ] **Step 1: Добавить путь в swagger.yaml**

Открыть `backend/swagger.yaml`, найти секцию `paths:` (строка ~23). Добавить после блока `/workflows/{workflowId}/runs:` (строка ~345; вставить непосредственно перед следующим блоком, чтобы соблюсти порядок):

```yaml
  /workflows/{workflowId}/ab-analytics:
    get:
      tags: [Analytics]
      summary: Аналитика по выбранной A/B-ноде workflow.
      parameters:
        - name: workflowId
          in: path
          required: true
          schema:
            type: string
            format: uuid
        - name: abNodeId
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AbAnalyticsResponse'
        '400':
          description: BAD REQUEST (node is not an A/B split, or abNodeId blank)
        '404':
          description: NOT FOUND (workflow or node)
```

В секции `components:` → `schemas:` (поищите `WorkflowRun:`/`NodeRun:` как примеры формата) добавьте:

```yaml
    AbAnalyticsResponse:
      type: object
      required: [abNodeId, mode, totalRuns, excludedNoVariant, computedAt, variants, warnings]
      properties:
        abNodeId: { type: string }
        mode: { type: string, enum: [pick, split] }
        totalRuns: { type: integer }
        excludedNoVariant: { type: integer }
        computedAt: { type: string, format: date-time }
        variants:
          type: array
          items: { $ref: '#/components/schemas/AbVariantRow' }
        warnings:
          type: array
          items: { type: string }
    AbVariantRow:
      type: object
      required: [key, label, color, runs, trafficCount, trafficPct, isBaseline, isSignificant]
      properties:
        key: { type: string }
        label: { type: string }
        color: { type: string }
        weight: { type: integer, nullable: true }
        runs: { type: integer }
        trafficCount: { type: integer }
        trafficPct: { type: number, format: double }
        conversions: { type: integer, nullable: true }
        conversionPct: { type: number, format: double, nullable: true }
        ciLow: { type: number, format: double, nullable: true }
        ciHigh: { type: number, format: double, nullable: true }
        liftVsBaseline: { type: number, format: double, nullable: true }
        pValue: { type: number, format: double, nullable: true }
        isBaseline: { type: boolean }
        isSignificant: { type: boolean }
```

Если есть глобальная секция `tags:` (поиск `^tags:` в начале swagger.yaml) — добавить туда:

```yaml
  - name: Analytics
    description: Аналитика по экспериментам.
```

- [ ] **Step 2: Регенерировать TS-типы**

Run: `(cd frontend && npm run gen:api)`
Expected: `frontend/src/app/core/api/api.types.ts` обновлён без ошибок. Проверьте `grep AbAnalyticsResponse frontend/src/app/core/api/api.types.ts` — должна найтись схема.

- [ ] **Step 3: Добавить short alias в api.models.ts**

Открыть `frontend/src/app/core/api/api.models.ts`, добавить после блока `export type WorkflowRunResult = ...`:

```ts
export type AbAnalyticsResponse = Schemas['AbAnalyticsResponse'];
export type AbVariantRow = Schemas['AbVariantRow'];
```

- [ ] **Step 4: Type-check фронт**

Run: `(cd frontend && npx --no-install tsc --noEmit -p tsconfig.app.json)`
Expected: тихий выход (0 ошибок).

- [ ] **Step 5: Commit**

```bash
git add backend/swagger.yaml \
        frontend/src/app/core/api/api.types.ts \
        frontend/src/app/core/api/api.models.ts
git commit -m "feat(api): swagger + ts-aliases для AbAnalyticsResponse"
```

---

## Task 8: AnalyticsApiService на фронте

**Files:**
- Create: `frontend/src/app/core/api/analytics.api.ts`

- [ ] **Step 1: Сервис обёртки HTTP**

```ts
// frontend/src/app/core/api/analytics.api.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AbAnalyticsResponse } from './api.models';

/**
 * REST-обёртка над аналитикой A/B-экспериментов.
 *   GET /workflows/{workflowId}/ab-analytics?abNodeId=...
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    getAbAnalytics(workflowId: string, abNodeId: string): Observable<AbAnalyticsResponse> {
        return this.http.get<AbAnalyticsResponse>(
            `${this.base}/workflows/${workflowId}/ab-analytics`,
            { params: { abNodeId } },
        );
    }
}
```

- [ ] **Step 2: Убедиться, что компилится**

Run: `(cd frontend && npx --no-install tsc --noEmit -p tsconfig.app.json)`
Expected: тихий выход.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/api/analytics.api.ts
git commit -m "feat(api): AnalyticsApiService — getAbAnalytics"
```

---

## Task 9: AnalyticsPanelComponent — UI

**Files:**
- Create: `frontend/src/app/components/analytics-panel/analytics-panel.component.ts`

- [ ] **Step 1: Компонент**

```ts
// frontend/src/app/components/analytics-panel/analytics-panel.component.ts
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsApiService } from '../../core/api/analytics.api';
import { WorkflowService } from '../../services/workflow.service';
import type { AbAnalyticsResponse, AbVariantRow } from '../../core/api/api.models';

@Component({
    selector: 'app-analytics-panel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <section class="analytics-panel">
        <header class="ap-header">
            <label class="ap-experiment">
                Эксперимент:
                <select [ngModel]="selectedAbNodeId()" (ngModelChange)="selectAbNode($event)"
                        [disabled]="abNodes().length === 0">
                    @for (n of abNodes(); track n.id) {
                        <option [value]="n.id">{{ n.data.label || n.id }}</option>
                    }
                </select>
            </label>
            <span class="ap-period">All time</span>
            <button type="button" class="ap-refresh" (click)="refresh()" [disabled]="loading()"
                    title="Refresh"
                    aria-label="Refresh">↻</button>
        </header>

        @if (abNodes().length === 0) {
            <div class="ap-empty">В этом workflow нет A/B-нод. Добавьте ноду «Split / A·B» из палитры.</div>
        } @else if (error()) {
            <div class="ap-error">{{ error() }}</div>
        } @else if (!response()) {
            <div class="ap-empty">Загрузка…</div>
        } @else if (response()!.totalRuns === 0) {
            <div class="ap-empty">Запусков с этим экспериментом ещё не было.</div>
        } @else {
            <section class="ap-section">
                <h4>Traffic distribution ({{ response()!.totalRuns }} runs)</h4>
                @for (v of response()!.variants; track v.key) {
                    <div class="ap-row">
                        <span class="ap-dot" [style.background]="v.color"></span>
                        <span class="ap-key">{{ v.key }}</span>
                        <span class="ap-pct">{{ v.trafficPct | number:'1.0-1' }}%</span>
                        <span class="ap-count">({{ v.trafficCount }})</span>
                        @if (v.weight != null) {
                            <span class="ap-expected">expected {{ v.weight }}%</span>
                        }
                    </div>
                }
                <div class="ap-bar">
                    @for (v of response()!.variants; track v.key) {
                        <span class="ap-bar-seg"
                              [style.width.%]="v.trafficPct"
                              [style.background]="v.color"
                              [title]="v.key + ': ' + (v.trafficPct | number:'1.0-1') + '%'"></span>
                    }
                </div>
            </section>

            @if (response()!.mode === 'pick') {
                <section class="ap-section">
                    <h4>Conversion (run-success)</h4>
                    <table class="ap-table">
                        <thead>
                            <tr><th>Variant</th><th>Runs</th><th>Conv</th><th>95% CI</th><th>Lift</th><th>p</th></tr>
                        </thead>
                        <tbody>
                            @for (v of response()!.variants; track v.key) {
                                <tr>
                                    <td>
                                        <span class="ap-dot" [style.background]="v.color"></span>
                                        {{ v.key }}
                                        @if (v.isBaseline) { <span class="ap-baseline">baseline</span> }
                                    </td>
                                    <td>{{ v.runs }}</td>
                                    <td>{{ v.conversionPct != null ? (v.conversionPct | number:'1.0-1') + '%' : '—' }}</td>
                                    <td>
                                        @if (v.ciLow != null) {
                                            {{ v.ciLow | number:'1.0-1' }}–{{ v.ciHigh | number:'1.0-1' }}
                                        } @else { — }
                                    </td>
                                    <td>
                                        @if (v.liftVsBaseline != null) {
                                            {{ v.liftVsBaseline > 0 ? '+' : '' }}{{ v.liftVsBaseline | number:'1.0-1' }}pp
                                        } @else { — }
                                    </td>
                                    <td>
                                        @if (v.pValue != null) {
                                            {{ v.pValue | number:'1.0-3' }}
                                            @if (v.isSignificant) { <span class="ap-sig" title="p<0.05, n≥30">✰</span> }
                                        } @else { — }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </section>
            } @else {
                <div class="ap-hint">Conversion недоступна для split-mode.</div>
            }

            @if (response()!.warnings.length > 0) {
                <ul class="ap-warnings">
                    @for (w of response()!.warnings; track $index) { <li>{{ w }}</li> }
                </ul>
            }
        }
    </section>
    `,
    styles: [`
        :host { display: block; width: 100%; height: 100%; min-height: 0; }
        .analytics-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px; min-width: 0; height: 100%; box-sizing: border-box; overflow: auto; }
        .ap-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .ap-experiment { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .ap-experiment select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; min-width: 0; }
        .ap-period { color: var(--fg-muted); font-size: 12px; }
        .ap-refresh { margin-left: auto; padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: transparent; cursor: pointer; }
        .ap-refresh:disabled { opacity: 0.5; cursor: default; }
        .ap-section h4 { margin: 0 0 6px; font-size: 13px; color: var(--fg-secondary); }
        .ap-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }
        .ap-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .ap-key { font-weight: 600; min-width: 28px; }
        .ap-pct { font-variant-numeric: tabular-nums; }
        .ap-count, .ap-expected { color: var(--fg-muted); font-size: 11px; }
        .ap-bar { display: flex; height: 10px; border-radius: 4px; overflow: hidden; margin-top: 4px; background: var(--bg-tertiary); }
        .ap-bar-seg { display: block; height: 100%; }
        .ap-table { width: 100%; font-size: 12px; border-collapse: collapse; }
        .ap-table th, .ap-table td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--border); }
        .ap-table th { color: var(--fg-secondary); font-weight: 600; }
        .ap-baseline { font-size: 10px; color: var(--fg-muted); margin-left: 4px; }
        .ap-sig { color: var(--success, #34c97c); margin-left: 4px; }
        .ap-empty, .ap-error, .ap-hint { color: var(--fg-muted); font-size: 12px; padding: 8px 0; }
        .ap-error { color: var(--danger); }
        .ap-warnings { margin: 0; padding-left: 16px; font-size: 11px; color: var(--fg-muted); }
    `]
})
export class AnalyticsPanelComponent {
    readonly workflowId = input.required<string>();
    private readonly api = inject(AnalyticsApiService);
    private readonly ws = inject(WorkflowService);

    readonly selectedAbNodeId = signal<string | null>(null);
    readonly response = signal<AbAnalyticsResponse | null>(null);
    readonly loading = signal<boolean>(false);
    readonly error = signal<string | null>(null);

    readonly abNodes = computed(() =>
        this.ws.nodes().filter(n => n.data.kind === 'ab')
    );

    constructor() {
        // Авто-выбор первой ab-ноды, если ничего не выбрано или выбранная исчезла.
        effect(() => {
            const list = this.abNodes();
            const current = this.selectedAbNodeId();
            if (list.length === 0) {
                if (current !== null) this.selectedAbNodeId.set(null);
                this.response.set(null);
                return;
            }
            if (!current || !list.find(n => n.id === current)) {
                this.selectedAbNodeId.set(list[0].id);
            }
        }, { allowSignalWrites: true });

        // Перезагружаем данные при смене выбранной ноды или workflow.
        effect(() => {
            const wfId = this.workflowId();
            const nodeId = this.selectedAbNodeId();
            if (!nodeId) return;
            this.fetch(wfId, nodeId);
        });
    }

    selectAbNode(id: string): void {
        this.selectedAbNodeId.set(id);
    }

    refresh(): void {
        const wfId = this.workflowId();
        const nodeId = this.selectedAbNodeId();
        if (!nodeId) return;
        this.fetch(wfId, nodeId);
    }

    private fetch(workflowId: string, abNodeId: string): void {
        this.loading.set(true);
        this.error.set(null);
        this.api.getAbAnalytics(workflowId, abNodeId).subscribe({
            next: (resp) => { this.response.set(resp); this.loading.set(false); },
            error: (err) => {
                this.error.set(err?.error?.message || err?.message || 'Не удалось загрузить аналитику');
                this.loading.set(false);
            },
        });
    }
}
```

- [ ] **Step 2: Type-check**

Run: `(cd frontend && npx --no-install tsc --noEmit -p tsconfig.app.json)`
Expected: тихий выход.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/analytics-panel/analytics-panel.component.ts
git commit -m "feat(analytics): AnalyticsPanelComponent — traffic bars + conversion table"
```

---

## Task 10: Smoke spec для AnalyticsPanelComponent

**Files:**
- Create: `frontend/src/app/components/analytics-panel/analytics-panel.component.spec.ts`

- [ ] **Step 1: Smoke spec**

```ts
// frontend/src/app/components/analytics-panel/analytics-panel.component.spec.ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { AnalyticsPanelComponent } from './analytics-panel.component';
import { WorkflowService } from '../../services/workflow.service';
import { environment } from '../../../environments/environment';

describe('AnalyticsPanelComponent', () => {
    let fixture: ComponentFixture<AnalyticsPanelComponent>;
    let httpMock: HttpTestingController;
    let wsStub: { nodes: ReturnType<typeof signal<any[]>> };

    beforeEach(() => {
        wsStub = { nodes: signal<any[]>([]) };
        TestBed.configureTestingModule({
            imports: [AnalyticsPanelComponent],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: WorkflowService, useValue: wsStub },
            ],
        });
        httpMock = TestBed.inject(HttpTestingController);
        fixture = TestBed.createComponent(AnalyticsPanelComponent);
        fixture.componentRef.setInput('workflowId', 'wf-1');
    });

    afterEach(() => httpMock.verify());

    it('shows empty state when no ab nodes', () => {
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('нет A/B-нод');
    });

    it('renders traffic bars for pick-mode response', () => {
        wsStub.nodes.set([{ id: 'ab1', data: { kind: 'ab', label: 'AB' } }]);
        fixture.detectChanges();
        const req = httpMock.expectOne(
            r => r.url === `${environment.apiBaseUrl}/workflows/wf-1/ab-analytics`
        );
        req.flush({
            abNodeId: 'ab1',
            mode: 'pick',
            totalRuns: 10,
            excludedNoVariant: 0,
            computedAt: new Date().toISOString(),
            variants: [
                {
                    key: 'A', label: 'Control', color: '#84cc16', weight: 50,
                    runs: 6, trafficCount: 6, trafficPct: 60.0,
                    conversions: 4, conversionPct: 66.7, ciLow: 30.0, ciHigh: 90.0,
                    liftVsBaseline: null, pValue: null, isBaseline: true, isSignificant: false,
                },
                {
                    key: 'B', label: 'Treatment', color: '#3b82f6', weight: 50,
                    runs: 4, trafficCount: 4, trafficPct: 40.0,
                    conversions: 3, conversionPct: 75.0, ciLow: 35.0, ciHigh: 95.0,
                    liftVsBaseline: 8.3, pValue: 0.7, isBaseline: false, isSignificant: false,
                },
            ],
            warnings: [],
        });
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Traffic distribution');
        expect(text).toContain('Conversion');
    });

    it('hides Conversion section for split-mode', () => {
        wsStub.nodes.set([{ id: 'ab1', data: { kind: 'ab', label: 'AB' } }]);
        fixture.detectChanges();
        const req = httpMock.expectOne(
            r => r.url === `${environment.apiBaseUrl}/workflows/wf-1/ab-analytics`
        );
        req.flush({
            abNodeId: 'ab1',
            mode: 'split',
            totalRuns: 1,
            excludedNoVariant: 0,
            computedAt: new Date().toISOString(),
            variants: [
                { key: 'A', label: 'A', color: '#84cc16', weight: 50, runs: 0, trafficCount: 5, trafficPct: 50, conversions: null, conversionPct: null, ciLow: null, ciHigh: null, liftVsBaseline: null, pValue: null, isBaseline: true, isSignificant: false },
                { key: 'B', label: 'B', color: '#3b82f6', weight: 50, runs: 0, trafficCount: 5, trafficPct: 50, conversions: null, conversionPct: null, ciLow: null, ciHigh: null, liftVsBaseline: null, pValue: null, isBaseline: false, isSignificant: false },
            ],
            warnings: [],
        });
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Conversion недоступна для split-mode');
    });
});
```

- [ ] **Step 2: Запустить spec**

Run: `(cd frontend && npx --no-install ng test --include='src/app/components/analytics-panel/**/*.spec.ts' --watch=false --browsers=ChromeHeadless)`
Expected: 3 tests passed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/analytics-panel/analytics-panel.component.spec.ts
git commit -m "test(analytics): smoke spec для AnalyticsPanelComponent"
```

---

## Task 11: Интеграция вкладки в workflow-editor

**Files:**
- Modify: `frontend/src/app/pages/workflow-editor/workflow-editor.component.ts`

- [ ] **Step 1: Импортировать компонент и расширить тип `bottomTab`**

В `frontend/src/app/pages/workflow-editor/workflow-editor.component.ts`:

1. Найти строку с импортом `RunsPanelComponent` (около line 15) и добавить рядом:

```ts
import { AnalyticsPanelComponent } from '../../components/analytics-panel/analytics-panel.component';
```

2. Найти `@Component({ ... imports: [...] })` декоратор и добавить `AnalyticsPanelComponent` в массив `imports`.

3. Найти строку `readonly bottomTab = signal<'log' | 'runs'>('log');` (около line 1706) и заменить на:

```ts
readonly bottomTab = signal<'log' | 'runs' | 'analytics'>('log');
```

4. Найти метод `selectBottomTab(tab: 'log' | 'runs'): void {` (около line 2091) и заменить сигнатуру на:

```ts
selectBottomTab(tab: 'log' | 'runs' | 'analytics'): void {
```

- [ ] **Step 2: Добавить кнопку вкладки в шаблон**

Найти блок с кнопкой `selectBottomTab('runs')` (около line 313):

```html
<button ... [class.active]="!logPanelCollapsed() && bottomTab() === 'runs'"
            (click)="selectBottomTab('runs')">...</button>
```

Сразу после этой кнопки добавить третью кнопку (стилизация — копия `runs`-кнопки; используй те же CSS-классы, что и для `runs`):

```html
<button class="tab"
        [class.active]="!logPanelCollapsed() && bottomTab() === 'analytics'"
        (click)="selectBottomTab('analytics')">
    Аналитика
</button>
```

> Точные классы могут отличаться — повтори структуру соседней кнопки `runs` 1-в-1, только подмени строки `'runs'` → `'analytics'` и подпись `«Запуски»` → `«Аналитика»`.

- [ ] **Step 3: Добавить @else if блок с компонентом**

Найти блок `} @else if (bottomTab() === 'runs') {` (около line 365) и сразу после его закрывающей `}` добавить:

```html
} @else if (bottomTab() === 'analytics') {
    <div class="bottom-panel-content">
        @if (currentWorkflowIdValue()) {
            <app-analytics-panel [workflowId]="currentWorkflowIdValue()!"></app-analytics-panel>
        }
    </div>
}
```

> CSS-класс контейнера и условие `currentWorkflowIdValue()` — те же, что у соседнего `runs`-блока. Сверь со строкой 368 (`<app-runs-panel ...>`).

- [ ] **Step 4: Type-check + ng-build (warmup)**

Run: `(cd frontend && npx --no-install tsc --noEmit -p tsconfig.app.json)`
Expected: тихий выход.

- [ ] **Step 5: Smoke в браузере (вручную)**

В отдельном терминале:

```bash
cd frontend && npm start
```

Открыть `http://localhost:4200/`, открыть любой workflow с ab-нодой, в нижней панели нажать вкладку «Аналитика». Проверить:
- Если ab-нод нет — показывается «нет A/B-нод».
- Если есть — dropdown с выбором, кнопка ↻, после refresh — таблица/бары (или empty-state, если runs не было).
- Запустить пару runs через Execute → нажать ↻ в аналитике → числа обновляются.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/workflow-editor/workflow-editor.component.ts
git commit -m "feat(editor): вкладка «Аналитика» в нижней панели"
```

---

## Финальная проверка

- [ ] **Прогнать весь backend test-suite**

Run: `(cd backend && ./mvnw test -q)`
Expected: BUILD SUCCESS, 0 failures.

- [ ] **Прогнать frontend specs**

Run: `(cd frontend && npx --no-install ng test --watch=false --browsers=ChromeHeadless)`
Expected: 0 failures.

- [ ] **Type-check фронта**

Run: `(cd frontend && npx --no-install tsc --noEmit -p tsconfig.app.json)`
Expected: тихий выход.

- [ ] **Финальный commit (если нужны мелкие правки) и push при готовности**

`git push` пользователь решит сам.
