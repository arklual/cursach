# A/B Split + Feature Flag + Merge nodes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать ноды `branch.split` (A/B + feature flag, 6 стратегий) и `branch.merge` (склейка веток) с реальной маршрутизацией через `edge.variant` в исполнителе workflow.

**Architecture:** Split-нода возвращает структурированный `{mode, variants|payload, meta}` envelope. `WorkflowExecutionService` смотрит на `edge.variant` и в split-mode отдаёт downstream-ноде только её подмножество; в pick-mode — помечает не-выбранные ветки `skipped` (распространяется до Merge, который ведёт себя как or-join). Merge — обычная нода с несколькими входами, конкат массивов с тэгом `_variant`.

**Tech Stack:** Backend — Kotlin 2.2, Spring Boot 4.0, Jackson, JUnit5. Frontend — Angular 19.2, TypeScript 5.6, Signals, Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-05-19-ab-flag-merge-nodes-design.md` — обязательно к прочтению перед началом.

---

## File map

### Create
- `backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutor.kt` — основной executor.
- `backend/src/main/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutor.kt` — merge executor.
- `backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitStrategies.kt` — реализации 6 стратегий, чистые функции, легко тестировать.
- `backend/src/main/kotlin/ru/startem/aelevena/executor/SplitEnvelope.kt` — helper для unwrap split/pick envelope в executor'е.
- `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutorTest.kt`
- `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitStrategiesTest.kt`
- `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutorTest.kt`
- `backend/src/test/kotlin/ru/startem/aelevena/executor/SplitEnvelopeTest.kt`
- `backend/src/test/kotlin/ru/startem/aelevena/run/WorkflowExecutionServiceBranchTest.kt` — интеграционный @SpringBootTest с testcontainers.
- `frontend/src/app/components/inspector/branch-split-inspector.component.ts`
- `frontend/src/app/components/inspector/branch-merge-inspector.component.ts`

### Modify
- `backend/src/main/kotlin/ru/startem/aelevena/api/dto/WorkflowDtos.kt` — добавить `variant` в `Connection`.
- `backend/src/main/kotlin/ru/startem/aelevena/workflow/model/GraphSkeleton.kt` — добавить `variant` в `ConnectionSkeleton`.
- `backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt` — пробросить `variant` в обе стороны mapping'а; добавить валидацию графа для Split/Merge.
- `backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt` — рефакторинг `buildNodeInput`, skip-логика для pick-mode.
- `frontend/src/app/core/api/workflow.mapper.ts` — снять hack-mapping, добавить `connection.variant`.
- `frontend/src/app/services/workflow.service.ts` — обновить шаблоны для `ab`/`join`.
- `frontend/src/app/services/workflow-validator.service.ts` — добавить правила §6 спеки.
- `frontend/src/app/components/palette/palette.component.ts` — категория «Ветки».
- `frontend/src/app/components/workflow-node/workflow-node.component.ts` — мульти-хэндлы для `kind=ab`.
- `frontend/src/app/components/workflow-canvas/workflow-canvas.component.ts` — выбор `variant` при создании edge'а с variant-хэндла.
- `frontend/src/app/components/inspector/inspector.component.ts` — switch на новые dedicated inspector'ы для ab/join.

### Test
- `backend/src/test/kotlin/ru/startem/aelevena/workflow/WorkflowServiceTest.kt` (если есть — иначе добавить только relevant cases в существующие).
- `frontend/src/app/core/api/workflow.mapper.spec.ts` — round-trip для новых типов и variant.
- `frontend/src/app/services/workflow-validator.service.spec.ts` — новые правила.
- `frontend/src/app/components/inspector/branch-split-inspector.component.spec.ts`
- `frontend/src/app/components/inspector/branch-merge-inspector.component.spec.ts`

---

## Task 1: Add `variant` to Connection DTO and ConnectionSkeleton

**Files:**
- Modify: `backend/src/main/kotlin/ru/startem/aelevena/api/dto/WorkflowDtos.kt:63-69`
- Modify: `backend/src/main/kotlin/ru/startem/aelevena/workflow/model/GraphSkeleton.kt:28-34`
- Test: создать `backend/src/test/kotlin/ru/startem/aelevena/workflow/model/ConnectionSkeletonTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package ru.startem.aelevena.workflow.model

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ConnectionSkeletonTest {
    private val mapper = jacksonObjectMapper()

    @Test
    fun `variant сериализуется и десериализуется`() {
        val original = ConnectionSkeleton(id = "e1", source = "a", target = "b", variant = "A")
        val json = mapper.writeValueAsString(original)
        val back = mapper.readValue(json, ConnectionSkeleton::class.java)
        assertEquals("A", back.variant)
    }

    @Test
    fun `variant null по умолчанию для обратной совместимости`() {
        val json = """{"id":"e1","source":"a","target":"b"}"""
        val back = mapper.readValue(json, ConnectionSkeleton::class.java)
        assertNull(back.variant)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=ConnectionSkeletonTest`
Expected: компилируется, но FAIL на `Unresolved reference: variant`.

- [ ] **Step 3: Add `variant` field to both data classes**

`backend/src/main/kotlin/ru/startem/aelevena/workflow/model/GraphSkeleton.kt:28-34`:
```kotlin
data class ConnectionSkeleton(
    val id: String,
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
    val variant: String? = null,
)
```

`backend/src/main/kotlin/ru/startem/aelevena/api/dto/WorkflowDtos.kt:63-69`:
```kotlin
data class Connection(
    val id: String,
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
    val variant: String? = null,
)
```

- [ ] **Step 4: Pass `variant` через mapper'ы в WorkflowService**

`backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt:182-190` — добавить в `ConnectionSkeleton(...)` строку `variant = c.variant,`.

`backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt:205-213` — добавить в `Connection(...)` строку `variant = c.variant,`.

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd backend && ./mvnw test -Dtest=ConnectionSkeletonTest`
Expected: PASS оба теста.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/workflow/model/GraphSkeleton.kt \
        backend/src/main/kotlin/ru/startem/aelevena/api/dto/WorkflowDtos.kt \
        backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt \
        backend/src/test/kotlin/ru/startem/aelevena/workflow/model/ConnectionSkeletonTest.kt
git commit -m "feat(graph): variant поле в Connection и ConnectionSkeleton"
```

---

## Task 2: Создать BranchSplitStrategies (чистые функции) + тесты по стратегиям

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitStrategies.kt`
- Create: `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitStrategiesTest.kt`

**Контракт:** функция `assignVariant(item: JsonNode, ctx: SplitContext): String?` возвращает `key` варианта или `null` если элемент должен быть отброшен (для attribute без default — отбрасываем; для остальных — null недопустим). `SplitContext` несёт `variants`, `userIdField`, `salt`, `seed`, `rules`, `defaultVariant`, `percentage`, `stratifyBy` + `Random` (зерно).

- [ ] **Step 1: Write failing tests (по одному на стратегию)**

```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BranchSplitStrategiesTest {
    private val mapper: ObjectMapper = jacksonObjectMapper()
    private fun obj(s: String): JsonNode = mapper.readTree(s)

    private val abVariants = listOf(
        SplitVariant("A", "Control", 50),
        SplitVariant("B", "Treatment", 50),
    )

    @Test
    fun `random с seed детерминирован`() {
        val ctx1 = SplitContext(strategy = "random", variants = abVariants, seed = 42L)
        val ctx2 = SplitContext(strategy = "random", variants = abVariants, seed = 42L)
        val items = (1..100).map { obj("""{"id":$it}""") }
        val r1 = items.map { BranchSplitStrategies.assignVariant(it, ctx1) }
        val r2 = items.map { BranchSplitStrategies.assignVariant(it, ctx2) }
        assertEquals(r1, r2)
    }

    @Test
    fun `random weight 70 30 распределяет приблизительно`() {
        val variants = listOf(SplitVariant("A", "A", 70), SplitVariant("B", "B", 30))
        val ctx = SplitContext(strategy = "random", variants = variants, seed = 12345L)
        val items = (1..10000).map { obj("""{"id":$it}""") }
        val results = items.map { BranchSplitStrategies.assignVariant(it, ctx) }
        val aShare = results.count { it == "A" }.toDouble() / 10000
        assertTrue(aShare in 0.65..0.75, "Expected ~0.70, got $aShare")
    }

    @Test
    fun `hash sticky одинаковый user всегда в одной ветке`() {
        val ctx = SplitContext(
            strategy = "hash", variants = abVariants,
            userIdField = "user_id", salt = "exp1",
        )
        val item = obj("""{"user_id":"u-12345"}""")
        val r1 = BranchSplitStrategies.assignVariant(item, ctx)
        val r2 = BranchSplitStrategies.assignVariant(item, ctx)
        val r3 = BranchSplitStrategies.assignVariant(item, ctx)
        assertEquals(r1, r2)
        assertEquals(r2, r3)
        assertNotNull(r1)
    }

    @Test
    fun `hash разные salt дают разные распределения`() {
        val ctxA = SplitContext(strategy = "hash", variants = abVariants, userIdField = "user_id", salt = "exp1")
        val ctxB = SplitContext(strategy = "hash", variants = abVariants, userIdField = "user_id", salt = "exp2")
        val items = (1..1000).map { obj("""{"user_id":"u-$it"}""") }
        val diffs = items.count {
            BranchSplitStrategies.assignVariant(it, ctxA) != BranchSplitStrategies.assignVariant(it, ctxB)
        }
        assertTrue(diffs > 300, "Expected differing assignments, got $diffs")
    }

    @Test
    fun `modulo детерминирован по user_id`() {
        val ctx = SplitContext(strategy = "modulo", variants = abVariants, userIdField = "user_id")
        val item = obj("""{"user_id":"42"}""")
        val r1 = BranchSplitStrategies.assignVariant(item, ctx)
        val r2 = BranchSplitStrategies.assignVariant(item, ctx)
        assertEquals(r1, r2)
    }

    @Test
    fun `attribute правило in - country RU попадает в A`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = abVariants,
            rules = listOf(AttributeRule("A", "country", "in", mapper.readTree("""["RU","BY"]"""))),
            defaultVariant = "B",
        )
        val ru = obj("""{"country":"RU"}""")
        val us = obj("""{"country":"US"}""")
        assertEquals("A", BranchSplitStrategies.assignVariant(ru, ctx))
        assertEquals("B", BranchSplitStrategies.assignVariant(us, ctx))
    }

    @Test
    fun `attribute правило eq - plan pro попадает в A`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = abVariants,
            rules = listOf(AttributeRule("A", "plan", "eq", mapper.readTree("\"pro\""))),
            defaultVariant = "B",
        )
        assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"plan":"pro"}"""), ctx))
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"plan":"free"}"""), ctx))
    }

    @Test
    fun `percentage 20 - примерно 20% в первой ветке`() {
        val variants = listOf(SplitVariant("on", "On", 0), SplitVariant("off", "Off", 0))
        val ctx = SplitContext(
            strategy = "percentage", variants = variants,
            userIdField = "user_id", percentage = 20, salt = "ff-x",
        )
        val items = (1..10000).map { obj("""{"user_id":"u-$it"}""") }
        val onShare = items.count { BranchSplitStrategies.assignVariant(it, ctx) == "on" }.toDouble() / 10000
        assertTrue(onShare in 0.17..0.23, "Expected ~0.20, got $onShare")
    }

    @Test
    fun `stratified - внутри страты соблюдаются веса`() {
        val ctx = SplitContext(
            strategy = "stratified", variants = abVariants,
            userIdField = "user_id", stratifyBy = "country", salt = "s1",
        )
        val ruItems = (1..2000).map { obj("""{"user_id":"u-$it","country":"RU"}""") }
        val ruA = ruItems.count { BranchSplitStrategies.assignVariant(it, ctx) == "A" }.toDouble() / 2000
        assertTrue(ruA in 0.45..0.55, "Expected ~0.50 inside RU, got $ruA")
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=BranchSplitStrategiesTest`
Expected: компиляция падает на `Unresolved reference: SplitContext / SplitVariant / AttributeRule / BranchSplitStrategies`.

- [ ] **Step 3: Implement strategies module**

`backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitStrategies.kt`:
```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import java.util.zip.CRC32
import kotlin.random.Random

data class SplitVariant(val key: String, val label: String, val weight: Int)

data class AttributeRule(val variant: String, val field: String, val op: String, val value: JsonNode)

data class SplitContext(
    val strategy: String,
    val variants: List<SplitVariant>,
    val userIdField: String? = null,
    val salt: String? = null,
    val seed: Long? = null,
    val percentage: Int? = null,
    val rules: List<AttributeRule> = emptyList(),
    val defaultVariant: String? = null,
    val stratifyBy: String? = null,
) {
    val random: Random by lazy { seed?.let { Random(it) } ?: Random.Default }
}

object BranchSplitStrategies {
    fun assignVariant(item: JsonNode, ctx: SplitContext): String? {
        return when (ctx.strategy) {
            "random" -> assignRandom(ctx)
            "hash" -> assignHash(item, ctx)
            "modulo" -> assignModulo(item, ctx)
            "attribute" -> assignAttribute(item, ctx)
            "percentage" -> assignPercentage(item, ctx)
            "stratified" -> assignStratified(item, ctx)
            else -> throw IllegalArgumentException("unknown strategy '${ctx.strategy}'")
        }
    }

    private fun assignRandom(ctx: SplitContext): String {
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        var roll = ctx.random.nextInt(total)
        for (v in ctx.variants) {
            roll -= v.weight
            if (roll < 0) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun assignHash(item: JsonNode, ctx: SplitContext): String {
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        val userId = extractUserId(item, ctx)
        val bucket = (crc32("${ctx.salt ?: ""}|$userId") % total.toLong()).toInt()
        var acc = 0
        for (v in ctx.variants) {
            acc += v.weight
            if (bucket < acc) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun assignModulo(item: JsonNode, ctx: SplitContext): String {
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        val userId = extractUserId(item, ctx)
        val idHash = crc32(userId).toInt() and Int.MAX_VALUE
        val bucket = idHash % total
        var acc = 0
        for (v in ctx.variants) {
            acc += v.weight
            if (bucket < acc) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun assignAttribute(item: JsonNode, ctx: SplitContext): String? {
        for (rule in ctx.rules) {
            val left = item.get(rule.field) ?: continue
            if (matches(left, rule.op, rule.value)) {
                return rule.variant
            }
        }
        return ctx.defaultVariant
    }

    private fun assignPercentage(item: JsonNode, ctx: SplitContext): String {
        require(ctx.variants.size == 2) { "percentage requires exactly 2 variants" }
        val pct = ctx.percentage ?: throw IllegalArgumentException("percentage required")
        require(pct in 0..100) { "percentage must be 0..100" }
        val userId = extractUserId(item, ctx)
        val bucket = (crc32("${ctx.salt ?: ""}|$userId") % 100L).toInt()
        return if (bucket < pct) ctx.variants[0].key else ctx.variants[1].key
    }

    private fun assignStratified(item: JsonNode, ctx: SplitContext): String {
        require(!ctx.stratifyBy.isNullOrBlank()) { "stratifyBy required" }
        val stratum = item.get(ctx.stratifyBy)?.asText() ?: ""
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        val userId = extractUserId(item, ctx)
        val bucket = (crc32("${ctx.salt ?: ""}|$stratum|$userId") % total.toLong()).toInt()
        var acc = 0
        for (v in ctx.variants) {
            acc += v.weight
            if (bucket < acc) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun extractUserId(item: JsonNode, ctx: SplitContext): String {
        val field = ctx.userIdField
        require(!field.isNullOrBlank()) { "userIdField required for strategy '${ctx.strategy}'" }
        val v = item.get(field) ?: throw IllegalArgumentException("missing userIdField '$field' in item")
        return v.asText()
    }

    private fun crc32(s: String): Long {
        val crc = CRC32()
        crc.update(s.toByteArray(Charsets.UTF_8))
        return crc.value
    }

    private fun matches(left: JsonNode, op: String, right: JsonNode): Boolean {
        return when (op) {
            "eq" -> left.asText() == right.asText()
            "ne" -> left.asText() != right.asText()
            "in" -> right.isArray && right.any { it.asText() == left.asText() }
            "gt" -> left.isNumber && right.isNumber && left.asDouble() > right.asDouble()
            "gte" -> left.isNumber && right.isNumber && left.asDouble() >= right.asDouble()
            "lt" -> left.isNumber && right.isNumber && left.asDouble() < right.asDouble()
            "lte" -> left.isNumber && right.isNumber && left.asDouble() <= right.asDouble()
            else -> throw IllegalArgumentException("unknown op '$op'")
        }
    }
}
```

- [ ] **Step 4: Run tests, all PASS**

Run: `cd backend && ./mvnw test -Dtest=BranchSplitStrategiesTest`
Expected: 9/9 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitStrategies.kt \
        backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitStrategiesTest.kt
git commit -m "feat(executor): BranchSplitStrategies — 6 стратегий распределения"
```

---

## Task 3: Создать SplitEnvelope helper + тесты

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/executor/SplitEnvelope.kt`
- Create: `backend/src/test/kotlin/ru/startem/aelevena/executor/SplitEnvelopeTest.kt`

- [ ] **Step 1: Write failing test**

```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SplitEnvelopeTest {
    private val mapper: ObjectMapper = jacksonObjectMapper()

    @Test
    fun `split-mode envelope с edge variant отдаёт нужное подмножество`() {
        val envelope = mapper.readTree("""{"mode":"split","variants":{"A":[1,2],"B":[3]}}""")
        val out = SplitEnvelope.resolveForEdge(envelope, "A")
        assertTrue(out.isArray)
        assertEquals(2, out.size())
    }

    @Test
    fun `split-mode envelope без edge variant возвращает весь envelope`() {
        val envelope = mapper.readTree("""{"mode":"split","variants":{"A":[1],"B":[2]}}""")
        val out = SplitEnvelope.resolveForEdge(envelope, null)
        assertTrue(out.isObject)
        assertEquals("split", out.get("mode").asText())
    }

    @Test
    fun `split-mode с неизвестным variant возвращает весь envelope`() {
        val envelope = mapper.readTree("""{"mode":"split","variants":{"A":[1]}}""")
        val out = SplitEnvelope.resolveForEdge(envelope, "Z")
        assertTrue(out.isObject)
    }

    @Test
    fun `pick-mode envelope возвращает payload независимо от variant`() {
        val envelope = mapper.readTree("""{"mode":"pick","chosen":"A","payload":[1,2,3]}""")
        val out = SplitEnvelope.resolveForEdge(envelope, "A")
        assertTrue(out.isArray)
        assertEquals(3, out.size())
    }

    @Test
    fun `обычный объект без mode возвращается как есть`() {
        val envelope = mapper.readTree("""{"hello":"world"}""")
        val out = SplitEnvelope.resolveForEdge(envelope, "A")
        assertEquals("world", out.get("hello").asText())
    }

    @Test
    fun `массив возвращается как есть`() {
        val envelope = mapper.readTree("""[1,2,3]""")
        val out = SplitEnvelope.resolveForEdge(envelope, "A")
        assertTrue(out.isArray)
    }

    @Test
    fun `isPickEnvelope корректно определяет pick`() {
        assertTrue(SplitEnvelope.isPickEnvelope(mapper.readTree("""{"mode":"pick","chosen":"A"}""")))
        assertEquals(false, SplitEnvelope.isPickEnvelope(mapper.readTree("""{"mode":"split"}""")))
    }

    @Test
    fun `pickChosen возвращает выбранный вариант`() {
        assertEquals("B", SplitEnvelope.pickChosen(mapper.readTree("""{"mode":"pick","chosen":"B"}""")))
    }
}
```

- [ ] **Step 2: Run test to verify it fails (compilation error)**

Run: `cd backend && ./mvnw test -Dtest=SplitEnvelopeTest`
Expected: FAIL on `Unresolved reference: SplitEnvelope`.

- [ ] **Step 3: Implement SplitEnvelope**

`backend/src/main/kotlin/ru/startem/aelevena/executor/SplitEnvelope.kt`:
```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode

object SplitEnvelope {
    fun resolveForEdge(upstream: JsonNode, edgeVariant: String?): JsonNode {
        if (!upstream.isObject) {
            return upstream
        }
        val mode = upstream.get("mode")?.asText() ?: return upstream
        return when (mode) {
            "split" -> {
                val variants = upstream.get("variants") ?: return upstream
                if (edgeVariant != null && variants.has(edgeVariant)) {
                    variants.get(edgeVariant)
                } else {
                    upstream
                }
            }
            "pick" -> upstream.get("payload") ?: upstream
            else -> upstream
        }
    }

    fun isPickEnvelope(node: JsonNode): Boolean {
        return node.isObject && node.get("mode")?.asText() == "pick"
    }

    fun pickChosen(node: JsonNode): String? {
        return if (isPickEnvelope(node)) node.get("chosen")?.asText() else null
    }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd backend && ./mvnw test -Dtest=SplitEnvelopeTest`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/executor/SplitEnvelope.kt \
        backend/src/test/kotlin/ru/startem/aelevena/executor/SplitEnvelopeTest.kt
git commit -m "feat(executor): SplitEnvelope helper — unwrap split/pick envelope для edge.variant"
```

---

## Task 4: BranchSplitNodeExecutor — split-mode

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutor.kt`
- Create: `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutorTest.kt`

- [ ] **Step 1: Write failing tests for split-mode**

```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BranchSplitNodeExecutorTest {
    private val mapper: ObjectMapper = jacksonObjectMapper()
    private val executor = BranchSplitNodeExecutor(mapper)
    private fun j(s: String): JsonNode = mapper.readTree(s)

    @Test
    fun `type равен branch_split`() {
        assertEquals("branch.split", executor.type)
    }

    @Test
    fun `split-mode random раскладывает по подмножествам`() {
        val config = j("""{
            "mode":"split","strategy":"random","seed":42,
            "variants":[{"key":"A","label":"A","weight":50},{"key":"B","label":"B","weight":50}]
        }""")
        val input = mapper.createArrayNode().apply {
            for (i in 1..100) add(j("""{"id":$i}"""))
        }
        val out = executor.execute("n1", config, input)
        assertEquals("split", out.get("mode").asText())
        val variants = out.get("variants")
        assertNotNull(variants.get("A"))
        assertNotNull(variants.get("B"))
        assertEquals(100, variants.get("A").size() + variants.get("B").size())
    }

    @Test
    fun `split-mode добавляет _variant в каждый объект`() {
        val config = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":100}]
        }""")
        val input = j("""[{"id":1}]""")
        val out = executor.execute("n1", config, input)
        assertEquals("A", out.get("variants").get("A").get(0).get("_variant").asText())
    }

    @Test
    fun `split-mode envelope от upstream распаковывается`() {
        val config = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":100}]
        }""")
        val envelope = j("""{"runInput":null,"inputs":{"dep":[{"id":1},{"id":2}]}}""")
        val out = executor.execute("n1", config, envelope)
        assertEquals(2, out.get("variants").get("A").size())
    }

    @Test
    fun `split-mode meta содержит totals`() {
        val config = j("""{
            "mode":"split","strategy":"random","seed":42,
            "variants":[{"key":"A","label":"A","weight":50},{"key":"B","label":"B","weight":50}]
        }""")
        val input = mapper.createArrayNode().apply { for (i in 1..10) add(j("""{"id":$i}""")) }
        val out = executor.execute("n1", config, input)
        val totals = out.get("meta").get("totals")
        assertEquals(10, totals.get("A").asInt() + totals.get("B").asInt())
    }

    @Test
    fun `пустой массив - все variants пустые`() {
        val config = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":100}]
        }""")
        val out = executor.execute("n1", config, mapper.createArrayNode())
        assertEquals(0, out.get("variants").get("A").size())
    }

    @Test
    fun `примитивы не получают _variant но попадают в подмножество`() {
        val config = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":100}]
        }""")
        val input = j("""[1,2,3]""")
        val out = executor.execute("n1", config, input)
        val a = out.get("variants").get("A")
        assertEquals(3, a.size())
        assertTrue(a.get(0).isInt)
    }
}
```

- [ ] **Step 2: Run tests, expect compilation failure**

Run: `cd backend && ./mvnw test -Dtest=BranchSplitNodeExecutorTest`
Expected: FAIL — `Unresolved reference: BranchSplitNodeExecutor`.

- [ ] **Step 3: Implement BranchSplitNodeExecutor (split-mode only, pick в следующей таске)**

`backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutor.kt`:
```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Component

@Component
class BranchSplitNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "branch.split"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        require(config != null && config.isObject) { "branch.split requires object config" }
        val mode = config.get("mode")?.asText() ?: "split"
        val ctx = parseContext(nodeId, config)

        val resolvedInput = unwrapInputsEnvelope(input)
        val items = toArray(resolvedInput)

        return when (mode) {
            "split" -> executeSplit(items, ctx)
            "pick" -> executePick(items, ctx, resolvedInput)
            else -> throw IllegalArgumentException("unknown mode '$mode'")
        }
    }

    private fun executeSplit(items: ArrayNode, ctx: SplitContext): JsonNode {
        val buckets: MutableMap<String, ArrayNode> = ctx.variants
            .associate { it.key to objectMapper.createArrayNode() }
            .toMutableMap()
        val totals = mutableMapOf<String, Int>()

        for (item in items) {
            val key = BranchSplitStrategies.assignVariant(item, ctx) ?: continue
            val tagged = tagWithVariant(item, key)
            buckets.getOrPut(key) { objectMapper.createArrayNode() }.add(tagged)
            totals[key] = (totals[key] ?: 0) + 1
        }

        val out = objectMapper.createObjectNode()
        out.put("mode", "split")
        val variantsNode = objectMapper.createObjectNode()
        buckets.forEach { (k, v) -> variantsNode.set<JsonNode>(k, v) }
        out.set<JsonNode>("variants", variantsNode)

        val meta = objectMapper.createObjectNode()
        meta.put("strategy", ctx.strategy)
        val totalsNode = objectMapper.createObjectNode()
        totals.forEach { (k, v) -> totalsNode.put(k, v) }
        meta.set<JsonNode>("totals", totalsNode)
        out.set<JsonNode>("meta", meta)
        return out
    }

    private fun executePick(items: ArrayNode, ctx: SplitContext, payload: JsonNode): JsonNode {
        // В pick-mode используем первый элемент как «представителя» для выбора варианта.
        // Если входной массив пуст — берём пустой объект, что попадёт в defaultVariant
        // или первый вариант по стратегии.
        val sample: JsonNode = if (items.size() > 0) items.get(0) else objectMapper.createObjectNode()
        val chosen = BranchSplitStrategies.assignVariant(sample, ctx)
            ?: ctx.variants.first().key

        val out = objectMapper.createObjectNode()
        out.put("mode", "pick")
        out.put("chosen", chosen)
        out.set<JsonNode>("payload", payload)
        val meta = objectMapper.createObjectNode()
        meta.put("strategy", ctx.strategy)
        out.set<JsonNode>("meta", meta)
        return out
    }

    private fun tagWithVariant(item: JsonNode, key: String): JsonNode {
        if (!item.isObject) {
            return item
        }
        val copy = item.deepCopy<ObjectNode>()
        copy.put("_variant", key)
        return copy
    }

    private fun parseContext(nodeId: String, config: JsonNode): SplitContext {
        val variantsNode = config.get("variants")
        require(variantsNode != null && variantsNode.isArray && variantsNode.size() > 0) {
            "branch.split requires non-empty variants[]"
        }
        val variants = variantsNode.map {
            SplitVariant(
                key = it.get("key").asText(),
                label = it.get("label")?.asText() ?: it.get("key").asText(),
                weight = it.get("weight")?.asInt() ?: 0,
            )
        }

        val rules = config.get("rules")?.takeIf { it.isArray }?.map { r ->
            AttributeRule(
                variant = r.get("variant").asText(),
                field = r.get("field").asText(),
                op = r.get("op").asText(),
                value = r.get("value"),
            )
        }.orEmpty()

        return SplitContext(
            strategy = config.get("strategy")?.asText() ?: "random",
            variants = variants,
            userIdField = config.get("userIdField")?.asText(),
            salt = config.get("salt")?.asText() ?: nodeId,
            seed = config.get("seed")?.let { if (it.isNumber) it.asLong() else null },
            percentage = config.get("percentage")?.let { if (it.isNumber) it.asInt() else null },
            rules = rules,
            defaultVariant = config.get("defaultVariant")?.asText(),
            stratifyBy = config.get("stratifyBy")?.asText(),
        )
    }

    private fun unwrapInputsEnvelope(input: JsonNode): JsonNode {
        if (!input.isObject || !input.has("inputs")) {
            return input
        }
        val inputs = input.get("inputs")
        if (!inputs.isObject) {
            return input
        }
        val keys = inputs.fieldNames().asSequence().toList()
        if (keys.size == 1) {
            return inputs.get(keys[0])
        }
        return input
    }

    private fun toArray(node: JsonNode): ArrayNode {
        if (node.isArray) {
            return node as ArrayNode
        }
        if (node.isNull) {
            return objectMapper.createArrayNode()
        }
        return objectMapper.createArrayNode().add(node)
    }
}
```

- [ ] **Step 4: Run tests, all PASS**

Run: `cd backend && ./mvnw test -Dtest=BranchSplitNodeExecutorTest`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutor.kt \
        backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutorTest.kt
git commit -m "feat(executor): BranchSplitNodeExecutor split-mode + 6 стратегий"
```

---

## Task 5: BranchSplitNodeExecutor — pick-mode тесты

**Files:**
- Modify: `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutorTest.kt`

Pick-mode реализован в Task 4. В этой задаче — отдельные тесты.

- [ ] **Step 1: Add failing tests**

В конец `BranchSplitNodeExecutorTest`:
```kotlin
    @Test
    fun `pick-mode выбирает один variant и кладёт исходный payload`() {
        val config = j("""{
            "mode":"pick","strategy":"random","seed":42,
            "variants":[{"key":"A","label":"A","weight":100}]
        }""")
        val input = j("""[{"id":1},{"id":2}]""")
        val out = executor.execute("n1", config, input)
        assertEquals("pick", out.get("mode").asText())
        assertEquals("A", out.get("chosen").asText())
        assertTrue(out.get("payload").isArray)
        assertEquals(2, out.get("payload").size())
    }

    @Test
    fun `pick-mode hash sticky - одинаковый input даёт одинаковый chosen`() {
        val config = j("""{
            "mode":"pick","strategy":"hash",
            "userIdField":"user_id","salt":"exp",
            "variants":[{"key":"A","label":"A","weight":50},{"key":"B","label":"B","weight":50}]
        }""")
        val input = j("""[{"user_id":"u-42"}]""")
        val r1 = executor.execute("n1", config, input).get("chosen").asText()
        val r2 = executor.execute("n1", config, input).get("chosen").asText()
        assertEquals(r1, r2)
    }

    @Test
    fun `pick-mode пустой input - выбирает default или первый вариант`() {
        val config = j("""{
            "mode":"pick","strategy":"attribute",
            "rules":[],"defaultVariant":"B",
            "variants":[{"key":"A","label":"A","weight":50},{"key":"B","label":"B","weight":50}]
        }""")
        val out = executor.execute("n1", config, mapper.createArrayNode())
        assertEquals("B", out.get("chosen").asText())
    }
```

- [ ] **Step 2: Run, expect PASS (logic implemented in Task 4)**

Run: `cd backend && ./mvnw test -Dtest=BranchSplitNodeExecutorTest`
Expected: 10/10 PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/kotlin/ru/startem/aelevena/executor/BranchSplitNodeExecutorTest.kt
git commit -m "test(executor): pick-mode тесты для BranchSplitNodeExecutor"
```

---

## Task 6: BranchMergeNodeExecutor

**Files:**
- Create: `backend/src/main/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutor.kt`
- Create: `backend/src/test/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutorTest.kt`

**Контракт:** Merge получает `input` в формате executor-envelope `{runInput, inputs:{depA:..., depB:...}}` + читает `config.sourceVariants`. Так как edge.variant сам по себе не доходит до executor'а (передаётся через executor service), Merge будет использовать `sourceVariants` как fallback в этой таске, а проброс edge.variant сделаем в интеграционной Task 8.

Чтобы Merge мог различать variant без edge-метаданных, executor service в Task 8 будет дописывать в input специальное поле `inputVariants: {depId: variantKey}`, заполненное из `edge.variant`. Merge читает его в первую очередь.

- [ ] **Step 1: Write failing tests**

```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BranchMergeNodeExecutorTest {
    private val mapper: ObjectMapper = jacksonObjectMapper()
    private val executor = BranchMergeNodeExecutor(mapper)
    private fun j(s: String): JsonNode = mapper.readTree(s)

    @Test
    fun `type равен branch_merge`() {
        assertEquals("branch.merge", executor.type)
    }

    @Test
    fun `merge concat нескольких массивов с тэгом из inputVariants`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1}], "depB": [{"id":2}] },
          "inputVariants": { "depA": "A", "depB": "B" }
        }""")
        val out = executor.execute("merge1", null, input)
        assertTrue(out.isArray)
        assertEquals(2, out.size())
        val a = out.find { it.get("id").asInt() == 1 }!!
        val b = out.find { it.get("id").asInt() == 2 }!!
        assertEquals("A", a.get("_variant").asText())
        assertEquals("B", b.get("_variant").asText())
    }

    @Test
    fun `merge с sourceVariants из config переопределяет inputVariants`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1}] },
          "inputVariants": { "depA": "X" }
        }""")
        val config = j("""{"sourceVariants":{"depA":"OVERRIDE"}}""")
        val out = executor.execute("merge1", config, input)
        assertEquals("OVERRIDE", out.get(0).get("_variant").asText())
    }

    @Test
    fun `preserveExistingTag true - не перезаписывает существующий _variant`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1,"_variant":"PRESET"}] },
          "inputVariants": { "depA": "A" }
        }""")
        val config = j("""{"preserveExistingTag":true}""")
        val out = executor.execute("merge1", config, input)
        assertEquals("PRESET", out.get(0).get("_variant").asText())
    }

    @Test
    fun `preserveExistingTag false - перезаписывает`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1,"_variant":"PRESET"}] },
          "inputVariants": { "depA": "A" }
        }""")
        val config = j("""{"preserveExistingTag":false}""")
        val out = executor.execute("merge1", config, input)
        assertEquals("A", out.get(0).get("_variant").asText())
    }

    @Test
    fun `merge не дописывает _variant если variant не определён`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1}] }
        }""")
        val out = executor.execute("merge1", null, input)
        assertEquals(1, out.size())
        assertNull(out.get(0).get("_variant"))
    }

    @Test
    fun `merge игнорирует skipped вход (null или отсутствует)`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1}], "depB": null },
          "inputVariants": { "depA": "A" }
        }""")
        val out = executor.execute("merge1", null, input)
        assertEquals(1, out.size())
    }

    @Test
    fun `merge tagField меняет имя поля`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": [{"id":1}] },
          "inputVariants": { "depA": "A" }
        }""")
        val config = j("""{"tagField":"experiment_arm"}""")
        val out = executor.execute("merge1", config, input)
        assertEquals("A", out.get(0).get("experiment_arm").asText())
    }

    @Test
    fun `merge - не-массивный вход оборачивается в одноэлементный список`() {
        val input = j("""{
          "runInput": null,
          "inputs": { "depA": {"id":1} },
          "inputVariants": { "depA": "A" }
        }""")
        val out = executor.execute("merge1", null, input)
        assertEquals(1, out.size())
        assertEquals(1, out.get(0).get("id").asInt())
    }
}
```

- [ ] **Step 2: Run, expect compilation failure**

Run: `cd backend && ./mvnw test -Dtest=BranchMergeNodeExecutorTest`
Expected: FAIL — `Unresolved reference: BranchMergeNodeExecutor`.

- [ ] **Step 3: Implement BranchMergeNodeExecutor**

`backend/src/main/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutor.kt`:
```kotlin
package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Component

@Component
class BranchMergeNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "branch.merge"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val tagField = config?.get("tagField")?.asText()?.takeIf { it.isNotBlank() } ?: "_variant"
        val preserveExistingTag = config?.get("preserveExistingTag")?.asBoolean() ?: true
        val sourceVariants: Map<String, String> = config?.get("sourceVariants")
            ?.takeIf { it.isObject }
            ?.fields()?.asSequence()
            ?.associate { it.key to it.value.asText() }
            .orEmpty()

        val inputs = input.get("inputs")
        require(inputs != null && inputs.isObject) { "branch.merge expects envelope with inputs object" }

        val inputVariants: Map<String, String> = input.get("inputVariants")
            ?.takeIf { it.isObject }
            ?.fields()?.asSequence()
            ?.associate { it.key to it.value.asText() }
            .orEmpty()

        val out: ArrayNode = objectMapper.createArrayNode()
        inputs.fields().forEachRemaining { (depId, depOutput) ->
            if (depOutput == null || depOutput.isNull) {
                return@forEachRemaining
            }
            val variant: String? = sourceVariants[depId] ?: inputVariants[depId]
            val items = toArray(depOutput)
            for (item in items) {
                val tagged = applyTag(item, variant, tagField, preserveExistingTag)
                out.add(tagged)
            }
        }
        return out
    }

    private fun applyTag(item: JsonNode, variant: String?, tagField: String, preserveExisting: Boolean): JsonNode {
        if (variant == null) {
            return item
        }
        if (!item.isObject) {
            return item
        }
        val copy = item.deepCopy<ObjectNode>()
        if (preserveExisting && copy.has(tagField) && !copy.get(tagField).isNull) {
            return copy
        }
        copy.put(tagField, variant)
        return copy
    }

    private fun toArray(node: JsonNode): ArrayNode {
        if (node.isArray) {
            return node as ArrayNode
        }
        return objectMapper.createArrayNode().add(node)
    }
}
```

- [ ] **Step 4: Run tests, all PASS**

Run: `cd backend && ./mvnw test -Dtest=BranchMergeNodeExecutorTest`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutor.kt \
        backend/src/test/kotlin/ru/startem/aelevena/executor/BranchMergeNodeExecutorTest.kt
git commit -m "feat(executor): BranchMergeNodeExecutor — concat-with-variant-tag"
```

---

## Task 7: WorkflowExecutionService — рефактор buildNodeInput + edge-aware delivery

**Files:**
- Modify: `backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt`

Цель: `buildNodeInput` принимает список входящих `ConnectionSkeleton`, использует `SplitEnvelope.resolveForEdge`, и кладёт в input `inputVariants: {depId: edge.variant}` для Merge-ноды.

- [ ] **Step 1: Read current WorkflowExecutionService целиком**

Run: `cat backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt`
Запомнить контекст вокруг `buildNodeInput` (строки ~160-180) и основной цикл `topo.forEach`.

- [ ] **Step 2: Заменить сигнатуру buildNodeInput и его реализацию**

Найти текущую `private fun buildNodeInput(runInputJson: String?, deps: List<String>, outputs: Map<String, JsonNode>): JsonNode { ... }` и заменить на:

```kotlin
private fun buildNodeInput(
    runInputJson: String?,
    incomingEdges: List<ConnectionSkeleton>,
    outputs: Map<String, JsonNode>,
    skipped: Set<String>,
): JsonNode {
    val root = objectMapper.createObjectNode()
    val runInput = runInputJson?.let { objectMapper.readTree(it) } ?: NullNode.instance
    root.set<JsonNode>("runInput", runInput)

    val inputs = objectMapper.createObjectNode()
    val inputVariants = objectMapper.createObjectNode()
    for (edge in incomingEdges) {
        if (skipped.contains(edge.source)) {
            continue
        }
        val upstreamOutput = outputs[edge.source] ?: NullNode.instance
        val delivered = SplitEnvelope.resolveForEdge(upstreamOutput, edge.variant)
        inputs.set<JsonNode>(edge.source, delivered)
        if (edge.variant != null) {
            inputVariants.put(edge.source, edge.variant)
        } else if (SplitEnvelope.isPickEnvelope(upstreamOutput)) {
            SplitEnvelope.pickChosen(upstreamOutput)?.let { inputVariants.put(edge.source, it) }
        }
    }
    root.set<JsonNode>("inputs", inputs)
    if (inputVariants.size() > 0) {
        root.set<JsonNode>("inputVariants", inputVariants)
    }
    return root
}
```

Импорт сверху: `import ru.startem.aelevena.workflow.model.ConnectionSkeleton` (уже есть) и `import ru.startem.aelevena.executor.SplitEnvelope`.

- [ ] **Step 3: Обновить вызывающий код в основном цикле**

В существующем коде есть:
```kotlin
val deps = incoming[nodeId]?.toList().orEmpty()
// ...
val inputNode = buildNodeInput(run.inputJson, deps, outputs)
```

Заменить блок построения incoming на:
```kotlin
val incomingEdges: List<ConnectionSkeleton> = skeleton.connections.filter { c ->
    c.target == nodeId && reachableNodeIds.contains(c.source) && reachableNodeIds.contains(c.target)
}
```

Заменить вызов `buildNodeInput` на:
```kotlin
val inputNode = buildNodeInput(run.inputJson, incomingEdges, outputs, skippedSet)
```

`skippedSet` пока не существует — заведём заглушкой перед циклом:
```kotlin
val skippedSet = ConcurrentHashMap.newKeySet<String>()
```

(skip-логика наполнит его в Task 8; сейчас он остаётся пустым.)

- [ ] **Step 4: Run все executor + integration тесты, ничего не должно сломаться**

Run: `cd backend && ./mvnw test -Dtest='*NodeExecutor*' -Dtest='MvpIntegrationTests'`
Expected: PASS. Если падает — починить регрессии до коммита.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt
git commit -m "refactor(executor): buildNodeInput использует ConnectionSkeleton и SplitEnvelope"
```

---

## Task 8: WorkflowExecutionService — skip-логика для pick-mode

**Files:**
- Modify: `backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt`
- Create: `backend/src/test/kotlin/ru/startem/aelevena/run/WorkflowExecutionServiceBranchTest.kt`

- [ ] **Step 1: Write failing integration test**

```kotlin
package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.workflow.WorkflowService
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowGraph

@Testcontainers
@SpringBootTest(properties = ["app.seed.demo-workflows-enabled=false"])
class WorkflowExecutionServiceBranchTest {

    companion object {
        @Container @JvmStatic
        val postgres = PostgreSQLContainer("postgres:16-alpine").apply {
            withDatabaseName("test"); withUsername("test"); withPassword("test")
        }

        @Container @JvmStatic
        val minio = GenericContainer("minio/minio:latest")
            .withExposedPorts(9000)
            .withEnv("MINIO_ROOT_USER", "minioadmin")
            .withEnv("MINIO_ROOT_PASSWORD", "minioadmin")
            .withCommand("server", "/data")

        @JvmStatic @DynamicPropertySource
        fun props(r: DynamicPropertyRegistry) {
            r.add("spring.datasource.url") { postgres.jdbcUrl }
            r.add("spring.datasource.username") { postgres.username }
            r.add("spring.datasource.password") { postgres.password }
            r.add("app.s3.endpoint") { "http://${minio.host}:${minio.firstMappedPort}" }
            r.add("app.s3.access-key") { "minioadmin" }
            r.add("app.s3.secret-key") { "minioadmin" }
            r.add("app.s3.bucket") { "test-bucket" }
        }
    }

    @Autowired lateinit var workflows: WorkflowService
    @Autowired lateinit var runs: RunEnqueueService
    @Autowired lateinit var runQuery: RunQueryService
    @Autowired lateinit var nodeRuns: NodeRunRepository
    @Autowired lateinit var mapper: ObjectMapper

    @Test
    fun `Split split-mode плюс Merge - все элементы тэгируются и собираются`() {
        val wf = workflows.create("ab-split-test", "")
        val graph = WorkflowGraph(versionId = "0", nodes = listOf(
            Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                data = NodeData(label = "Split", config = mapper.readTree("""{
                    "mode":"split","strategy":"random","seed":42,
                    "variants":[{"key":"A","label":"A","weight":50},{"key":"B","label":"B","weight":50}]
                }"""))),
            Node(id = "passA", type = "dataflow.foreach", position = Position(100.0, 0.0),
                data = NodeData(label = "A passthrough", config = null)),
            Node(id = "passB", type = "dataflow.foreach", position = Position(100.0, 100.0),
                data = NodeData(label = "B passthrough", config = null)),
            Node(id = "merge", type = "branch.merge", position = Position(200.0, 50.0),
                data = NodeData(label = "Merge", config = null)),
        ), connections = listOf(
            Connection(id = "e1", source = "split", target = "passA", variant = "A"),
            Connection(id = "e2", source = "split", target = "passB", variant = "B"),
            Connection(id = "e3", source = "passA", target = "merge"),
            Connection(id = "e4", source = "passB", target = "merge"),
        ))
        workflows.saveGraph(wf.id, graph)
        val inputJson = """[{"id":1},{"id":2},{"id":3},{"id":4},{"id":5},{"id":6},{"id":7},{"id":8}]"""

        val runId = runs.startSync(workflowId = wf.id, startNodeId = "split", inputJson = inputJson)
        // Дождаться завершения (упрощённо — poll)
        waitForFinish(runId)

        val outputs = runQuery.outputs(runId)
        val mergeOut = outputs["merge"]!!
        assertTrue(mergeOut.isArray)
        assertEquals(8, mergeOut.size())
        val variants = mergeOut.map { it.get("_variant").asText() }.toSet()
        assertTrue(variants.contains("A") || variants.contains("B"))
    }

    @Test
    fun `Split pick-mode - не выбранная ветка skipped, Merge получает только активную`() {
        val wf = workflows.create("ab-pick-test", "")
        val graph = WorkflowGraph(versionId = "0", nodes = listOf(
            Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                data = NodeData(label = "Split", config = mapper.readTree("""{
                    "mode":"pick","strategy":"attribute",
                    "rules":[{"variant":"A","field":"force","op":"eq","value":"on"}],
                    "defaultVariant":"B",
                    "variants":[{"key":"A","label":"A","weight":50},{"key":"B","label":"B","weight":50}]
                }"""))),
            Node(id = "passA", type = "dataflow.foreach", position = Position(100.0, 0.0),
                data = NodeData(label = "A", config = null)),
            Node(id = "passB", type = "dataflow.foreach", position = Position(100.0, 100.0),
                data = NodeData(label = "B", config = null)),
            Node(id = "merge", type = "branch.merge", position = Position(200.0, 50.0),
                data = NodeData(label = "Merge", config = null)),
        ), connections = listOf(
            Connection(id = "e1", source = "split", target = "passA", variant = "A"),
            Connection(id = "e2", source = "split", target = "passB", variant = "B"),
            Connection(id = "e3", source = "passA", target = "merge"),
            Connection(id = "e4", source = "passB", target = "merge"),
        ))
        workflows.saveGraph(wf.id, graph)
        // force=on → choose A; B ветка должна быть skipped
        val inputJson = """[{"force":"on"}]"""
        val runId = runs.startSync(workflowId = wf.id, startNodeId = "split", inputJson = inputJson)
        waitForFinish(runId)

        val nodeRunStatuses = nodeRuns.findAllByRunId(runId).associate { it.nodeId to it.status }
        assertEquals("success", nodeRunStatuses["passA"])
        assertEquals("skipped", nodeRunStatuses["passB"])
        assertEquals("success", nodeRunStatuses["merge"])
    }

    private fun waitForFinish(runId: Long, timeoutMs: Long = 10_000) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val status = runQuery.findRun(runId)?.status
            if (status == "success" || status == "failed") return
            Thread.sleep(100)
        }
        throw AssertionError("Run $runId did not finish within ${timeoutMs}ms")
    }
}
```

(Если в `RunEnqueueService`/`RunQueryService`/`NodeRunRepository` нет методов `startSync`, `outputs`, `findAllByRunId`, `findRun` — используйте существующие методы и адаптируйте тест. Цель — вызвать `WorkflowExecutionService.execute(runId)` синхронно и проверить статусы NodeRun.)

- [ ] **Step 2: Run, expect skip-логика отсутствует — passB вернёт success вместо skipped**

Run: `cd backend && ./mvnw test -Dtest=WorkflowExecutionServiceBranchTest`
Expected: первый тест может пройти, второй — FAIL: `expected "skipped" but was "success"`.

- [ ] **Step 3: Реализовать skip-логику в основном цикле**

В `WorkflowExecutionService.execute(runId)` найти блок `topo.forEach { nodeId -> ... }` и заменить `thenApplyAsync` lambda на:

```kotlin
val f = ready.thenApplyAsync({
    val incomingEdges: List<ConnectionSkeleton> = skeleton.connections.filter { c ->
        c.target == nodeId && reachableNodeIds.contains(c.source) && reachableNodeIds.contains(c.target)
    }

    val liveIncoming = incomingEdges.filter { edge ->
        if (skippedSet.contains(edge.source)) {
            return@filter false
        }
        val up = outputs[edge.source]
        val isPickMismatch = up != null
            && SplitEnvelope.isPickEnvelope(up)
            && edge.variant != null
            && SplitEnvelope.pickChosen(up) != edge.variant
        !isPickMismatch
    }

    val nodeRunId = nodeRunIds.getValue(nodeId)

    if (incomingEdges.isNotEmpty() && liveIncoming.isEmpty()) {
        skippedSet.add(nodeId)
        nodeRuns.markSkipped(nodeRunId, "Branch not selected")
        return@thenApplyAsync NullNode.instance as JsonNode
    }

    val node = nodeById.getValue(nodeId)
    val inputNode = buildNodeInput(run.inputJson, liveIncoming, outputs, skippedSet)
    started.add(nodeId)
    nodeRuns.markRunning(nodeRunId, objectMapper.writeValueAsString(inputNode))

    val config = node.data?.configHash?.let { blobService.getJsonTree(it) }
    val executor = executors.get(node.type)
        ?: throw IllegalArgumentException("Unsupported node type: ${node.type}")

    val out = executor.execute(nodeId, config, inputNode)
    outputs[nodeId] = out
    nodeRuns.markSuccess(nodeRunId, objectMapper.writeValueAsString(out))
    out
}, workflowExecutor)
```

Также в `.whenComplete { _, ex -> ... }`: если nodeId уже в `skippedSet`, не вызывать `markSkipped(... "Dependency failed")` — только при настоящей ошибке.

```kotlin
}, workflowExecutor).whenComplete { _, ex ->
    if (ex != null && !skippedSet.contains(nodeId)) {
        val nodeRunId = nodeRunIds.getValue(nodeId)
        if (started.contains(nodeId)) {
            nodeRuns.markFailed(nodeRunId, rootMessage(ex))
        } else {
            nodeRuns.markSkipped(nodeRunId, "Dependency failed")
        }
    }
}
```

- [ ] **Step 4: Run integration tests**

Run: `cd backend && ./mvnw test -Dtest=WorkflowExecutionServiceBranchTest`
Expected: 2/2 PASS.

Также прогнать `MvpIntegrationTests` чтобы не сломать существующее:
Run: `cd backend && ./mvnw test -Dtest=MvpIntegrationTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt \
        backend/src/test/kotlin/ru/startem/aelevena/run/WorkflowExecutionServiceBranchTest.kt
git commit -m "feat(executor): skip-логика для pick-mode веток через SplitEnvelope"
```

---

## Task 9: Graph-level валидация Split/Merge в WorkflowService

**Files:**
- Modify: `backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt`

В существующей валидации графа (`saveGraph`, ~line 155-170) добавить проверки из §6 спеки. Бэк-уровень — error-only; warning'и оставим для фронта.

- [ ] **Step 1: Найти существующую валидацию графа**

Run: `grep -n 'BadRequestException\|validate' backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt`

Найти место где после nodeIdSet-проверки идёт цикл по `graph.connections`. Туда добавить новые проверки.

- [ ] **Step 2: Добавить проверки**

После цикла валидации connections, перед формированием skeleton, добавить:

```kotlin
// Validation for branch.split / branch.merge nodes
val nodesByType = graph.nodes.associateBy { it.id }
for (node in graph.nodes) {
    if (node.type == "branch.split") {
        val cfg = node.data?.config
        require(cfg != null && cfg.isObject) {
            throw BadRequestException("branch.split node '${node.id}' missing config")
        }
        val variants = cfg.get("variants")
            ?: throw BadRequestException("branch.split '${node.id}' missing variants[]")
        require(variants.isArray && variants.size() > 0) {
            throw BadRequestException("branch.split '${node.id}' variants[] must be non-empty")
        }
        val variantKeys = variants.map { it.get("key").asText() }.toSet()
        val totalWeight = variants.sumOf { (it.get("weight")?.asInt() ?: 0) }
        if (totalWeight <= 0) {
            throw BadRequestException("branch.split '${node.id}' sum of weights must be > 0")
        }
        val strategy = cfg.get("strategy")?.asText() ?: "random"
        if (strategy in setOf("hash", "modulo", "stratified", "percentage")) {
            val userIdField = cfg.get("userIdField")?.asText()
            if (userIdField.isNullOrBlank()) {
                throw BadRequestException("branch.split '${node.id}' strategy '$strategy' requires userIdField")
            }
        }
        if (strategy == "stratified" && cfg.get("stratifyBy")?.asText().isNullOrBlank()) {
            throw BadRequestException("branch.split '${node.id}' strategy 'stratified' requires stratifyBy")
        }

        // Each outgoing edge of split must have variant from variants[].key
        val outgoing = graph.connections.filter { it.source == node.id }
        for (e in outgoing) {
            val v = e.variant
            if (v == null) {
                throw BadRequestException("Edge ${e.id} from branch.split '${node.id}' missing variant")
            }
            if (v !in variantKeys) {
                throw BadRequestException("Edge ${e.id} variant '$v' not in variants[].key of '${node.id}'")
            }
        }
    }
}
```

- [ ] **Step 3: Add tests**

Создать или дополнить `backend/src/test/kotlin/ru/startem/aelevena/workflow/WorkflowServiceTest.kt`. Если файла нет — создать минимальный (без Spring контекста, через мок-репозиториев) или интеграционный @SpringBootTest.

Для краткости — добавить тесты в `WorkflowExecutionServiceBranchTest`:

```kotlin
@Test
fun `saveGraph бросает 400 если split edge без variant`() {
    val wf = workflows.create("validation-test", "")
    val graph = WorkflowGraph(versionId = "0", nodes = listOf(
        Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
            data = NodeData(label = "S", config = mapper.readTree("""{
                "mode":"split","strategy":"random",
                "variants":[{"key":"A","label":"A","weight":100}]
            }"""))),
        Node(id = "pass", type = "dataflow.foreach", position = Position(100.0, 0.0),
            data = NodeData(label = "P", config = null)),
    ), connections = listOf(
        Connection(id = "e1", source = "split", target = "pass"),  // нет variant
    ))
    org.junit.jupiter.api.assertThrows<Exception> { workflows.saveGraph(wf.id, graph) }
}

@Test
fun `saveGraph бросает 400 если hash без userIdField`() {
    val wf = workflows.create("validation-test-2", "")
    val graph = WorkflowGraph(versionId = "0", nodes = listOf(
        Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
            data = NodeData(label = "S", config = mapper.readTree("""{
                "mode":"split","strategy":"hash",
                "variants":[{"key":"A","label":"A","weight":100}]
            }"""))),
    ), connections = emptyList())
    org.junit.jupiter.api.assertThrows<Exception> { workflows.saveGraph(wf.id, graph) }
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && ./mvnw test -Dtest=WorkflowExecutionServiceBranchTest`
Expected: все тесты PASS, включая новые validation-тесты.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt \
        backend/src/test/kotlin/ru/startem/aelevena/run/WorkflowExecutionServiceBranchTest.kt
git commit -m "feat(graph): валидация branch.split конфига и edge.variant при сохранении"
```

---

## Task 10: Frontend mapper — branch.split / branch.merge round-trip

**Files:**
- Modify: `frontend/src/app/core/api/workflow.mapper.ts`
- Modify: `frontend/src/app/core/api/workflow.mapper.spec.ts`

- [ ] **Step 1: Add failing tests**

В конец `workflow.mapper.spec.ts`:
```typescript
describe('branch.split / branch.merge', () => {
    it('frontNodeToBackend для kind=ab выдаёт type=branch.split', () => {
        const front: FrontNode = {
            id: 'n1', type: 'ab', position: { x: 0, y: 0 },
            data: {
                id: 'n1', kind: 'ab', label: 'Split', color: '#f472b6',
                successProb: 0, variants: [],
                randomization: 'simple',
                metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                config: { mode: 'split', strategy: 'random' },
            },
        };
        const back = frontNodeToBackend(front);
        expect(back.type).toBe('branch.split');
    });

    it('frontNodeToBackend для kind=join выдаёт type=branch.merge', () => {
        const front: FrontNode = {
            id: 'n2', type: 'join', position: { x: 0, y: 0 },
            data: {
                id: 'n2', kind: 'join', label: 'Merge', color: '#c084fc',
                successProb: 0.5, variants: [], randomization: 'simple',
                metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
            },
        };
        const back = frontNodeToBackend(front);
        expect(back.type).toBe('branch.merge');
    });

    it('backendToFront для type=branch.split возвращает kind=ab', () => {
        const back = {
            id: 'n3', type: 'branch.split', position: { x: 0, y: 0 },
            data: { label: 'Split', config: { mode: 'split' } as never },
        };
        const front = backendNodeToFront(back as never);
        expect(front.data.kind).toBe('ab');
    });

    it('edge data.variant пробрасывается в connection.variant и обратно', () => {
        const edge: FrontEdge = {
            id: 'e1', source: 'a', target: 'b', data: { variant: 'A' },
        };
        const conn = frontEdgeToBackend(edge);
        expect(conn.variant).toBe('A');
        const back = backendEdgeToFront(conn);
        expect(back.data?.variant).toBe('A');
    });
});
```

(Если функции `frontEdgeToBackend` / `backendEdgeToFront` названы по-другому — посмотреть в `workflow.mapper.ts` и поправить.)

- [ ] **Step 2: Run, expect FAIL**

Run: `cd frontend && npm test -- --include='**/workflow.mapper.spec.ts' --watch=false`
Expected: FAIL — `ab` сейчас мапится в `dataflow.foreach`.

- [ ] **Step 3: Update mapper**

В `workflow.mapper.ts` функция `toBackendType`:
```typescript
function toBackendType(kind: NodeKind, subtype: string | undefined): string {
    if (kind === 'dataflow') { /* ... existing ... */ }
    if (kind === 'code') { /* ... */ }
    if (kind === 'http') { return 'http'; }
    if (kind === 'trigger') { /* ... */ }
    if (kind === 'ab') { return 'branch.split'; }
    if (kind === 'join') { return 'branch.merge'; }
    return 'dataflow.foreach';
}
```

В `fromBackendType`:
```typescript
function fromBackendType(type: string | undefined, originalKind?: NodeKind): { kind: NodeKind; subtype?: string } {
    if (type === 'branch.split') { return { kind: 'ab' }; }
    if (type === 'branch.merge') { return { kind: 'join' }; }
    // ... existing ...
    // Keep __originalKind fallback for legacy `dataflow.foreach`-coded ab/join
}
```

Edge mapper — добавить `variant` в обе стороны (найти соответствующие функции). Если edge mapping inline в `frontGraphToBackend`/обратно — добавить `variant: edge.data?.variant ?? null` при отправке и `data: conn.variant ? { variant: conn.variant } : undefined` при чтении.

- [ ] **Step 4: Run tests, all PASS**

Run: `cd frontend && npm test -- --include='**/workflow.mapper.spec.ts' --watch=false`
Expected: все тесты PASS (включая существующие round-trip).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/api/workflow.mapper.ts \
        frontend/src/app/core/api/workflow.mapper.spec.ts
git commit -m "feat(mapper): branch.split / branch.merge + edge.variant round-trip"
```

---

## Task 11: Frontend palette — категория «Ветки»

**Files:**
- Modify: `frontend/src/app/components/palette/palette.component.ts`

- [ ] **Step 1: Расширить тип PaletteItem.subtype если нужно (пока не нужно — ab/join без subtype)**

- [ ] **Step 2: Добавить иконки split/merge в `icons`**

В блок `private readonly icons = { ... }`:
```typescript
split: 'M3 12h6l3-9 3 18 3-9h3',           // примитивная zigzag
merge: 'M3 6c4 0 6 6 9 6s5-6 9-6 M3 18c4 0 6-6 9-6s5 6 9 6',
```

- [ ] **Step 3: Добавить категорию в `categories`**

В конец массива `categories`:
```typescript
{
    id: 'branches',
    name: 'Ветки',
    color: 'var(--info, #f472b6)',
    items: [
        { id: 'ab',   label: 'Split / A·B', kind: 'ab',   iconPath: this.icons.split },
        { id: 'join', label: 'Merge',       kind: 'join', iconPath: this.icons.merge },
    ],
},
```

- [ ] **Step 4: Запустить smoke-тест palette**

Run: `cd frontend && npm test -- --include='**/palette*spec*' --watch=false`
Expected: PASS (или скип, если spec'ов нет).

Run: `cd frontend && npm start` и визуально проверить, что в палитре видна категория «Ветки» с двумя нодами. Перетащить Split на канвас.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/palette/palette.component.ts
git commit -m "feat(palette): категория «Ветки» с Split и Merge"
```

---

## Task 12: Frontend workflow.service — шаблоны ab / join

**Files:**
- Modify: `frontend/src/app/services/workflow.service.ts`

Шаблон `ab` должен включать в `config` минимально валидный split-конфиг с двумя вариантами, чтобы только что добавленная нода не валилась валидацией.

- [ ] **Step 1: Найти `addNode`/`createDefaultNode` (метод создания ноды по kind)**

Run: `grep -n 'addNode\|createNode\|nodeTemplates' frontend/src/app/services/workflow.service.ts | head`

- [ ] **Step 2: Внутри функции создания ноды добавить switch по kind для config**

```typescript
private buildDefaultConfig(kind: NodeKind): Record<string, unknown> | undefined {
    if (kind === 'ab') {
        return {
            mode: 'split',
            strategy: 'random',
            variants: [
                { key: 'A', label: 'Control', weight: 50 },
                { key: 'B', label: 'Treatment', weight: 50 },
            ],
        };
    }
    if (kind === 'join') {
        return { tagField: '_variant', preserveExistingTag: true };
    }
    return undefined;
}
```

Вызвать `buildDefaultConfig(kind)` там, где формируется `NodeData.config` для нового узла.

Также в `addNode`/`createDefaultNode`: для `kind='ab'` шаблона `variants` (Variant[]) проставить из split-конфига (для совместимости с инспектором):
```typescript
const cfg = this.buildDefaultConfig(kind);
const variants = (cfg?.['variants'] as Array<{label: string; weight: number}>)
    ?.map(v => ({ label: v.label, weight: v.weight })) ?? [];
```

- [ ] **Step 3: Smoke test — создать ab-ноду на канвасе, удостовериться что config непустой**

(Юнит-тест опционален — добавить можно через `WorkflowService` spec.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/services/workflow.service.ts
git commit -m "feat(workflow): дефолтный config для ab (split + A/B 50/50) и join"
```

---

## Task 13: Frontend canvas — мульти-хэндлы для kind=ab

**Files:**
- Modify: `frontend/src/app/components/workflow-canvas/workflow-canvas.component.ts`
- Modify: `frontend/src/app/services/workflow.service.ts` (для signature `addEdge` если нужно)

**Цель:** Для `kind='ab'` рисовать на правой стороне ноды по одному `handle-out` на каждый variant из `node.data.config.variants[]`, с цветной точкой и подписью key. При начале draw из такого handle — запомнить выбранный variant и проставить его в `edge.data.variant` при создании ребра.

- [ ] **Step 1: Найти текущий рендер handle-out (line ~125)**

Run: `grep -n 'handle-out' frontend/src/app/components/workflow-canvas/workflow-canvas.component.ts`

- [ ] **Step 2: Заменить одиночный handle-out на условный рендер**

Заменить в template (внутри `@for (node of nodes())`):
```html
<!-- было: -->
<div class="handle handle-out" ...></div>

<!-- стало: -->
@if (node.data.kind === 'ab') {
    @for (variant of getAbVariants(node); track variant.key; let i = $index) {
        <div class="handle handle-out handle-variant"
             [style.top.%]="20 + i * 20"
             [attr.data-variant]="variant.key"
             [style.background-color]="getVariantColor(variant.key, i)"
             (mousedown)="onHandleMouseDown($event, node, 'out', variant.key)"
             [title]="'Variant ' + variant.key">
            <span class="handle-label">{{ variant.key }}</span>
        </div>
    }
} @else {
    <div class="handle handle-out"
         (mousedown)="onHandleMouseDown($event, node, 'out', null)"></div>
}
```

- [ ] **Step 3: Добавить методы компонента**

```typescript
getAbVariants(node: WorkflowNode): Array<{ key: string; label: string }> {
    const cfg = node.data.config as { variants?: Array<{key: string; label: string}> } | undefined;
    return cfg?.variants ?? [];
}

private readonly variantPalette = ['#84cc16', '#3b82f6', '#f472b6', '#fb923c', '#a78bfa'];
getVariantColor(key: string, index: number): string {
    return this.variantPalette[index % this.variantPalette.length];
}
```

- [ ] **Step 4: Расширить draw-сессию признаком variant**

В существующем поле `private drawSource: WorkflowNode | null = null;` добавить второе:
```typescript
private drawVariant: string | null = null;
```

В `onHandleMouseDown`/аналоге сохранять `this.drawVariant = variant;`. При финальном `addEdge` (line ~931) передавать:
```typescript
this.ws.addEdge(this.drawSource.id, target.id, undefined, this.drawVariant ?? undefined);
```

`workflow.service.ts::addEdge` уже поддерживает variant-параметр (см. line ~149).

- [ ] **Step 5: Стили для multi-handle**

В блок `styles: [`...`]` добавить:
```css
.handle-variant {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--bg-primary);
    cursor: crosshair;
    z-index: 2;
}
.handle-label {
    position: absolute;
    right: 100%;
    margin-right: 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--fg-secondary);
    line-height: 16px;
}
```

- [ ] **Step 6: Smoke test в браузере**

Run: `cd frontend && npm start`
- Перетащить Split на канвас.
- Должны появиться 2 точки A и B на правой стороне ноды.
- Потянуть от A к другой ноде → ребро создаётся с variant=A.
- Открыть DevTools → проверить, что `workflow.edges()` содержит `data: {variant: 'A'}`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/components/workflow-canvas/workflow-canvas.component.ts \
        frontend/src/app/services/workflow.service.ts
git commit -m "feat(canvas): мульти-хэндлы для ab-ноды, edge.variant при создании ребра"
```

---

## Task 14: Frontend — BranchSplitInspectorComponent

**Files:**
- Create: `frontend/src/app/components/inspector/branch-split-inspector.component.ts`
- Modify: `frontend/src/app/components/inspector/inspector.component.ts`

Отдельный inline-компонент. Минимальный UI на v1: mode toggle, strategy select, variants editor (key/label/weight), и conditional form-секции по strategy.

- [ ] **Step 1: Создать BranchSplitInspectorComponent**

`frontend/src/app/components/inspector/branch-split-inspector.component.ts`:
```typescript
import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowNode } from '../../models/workflow.model';

interface SplitVariantUi { key: string; label: string; weight: number; }
interface AttributeRuleUi { variant: string; field: string; op: string; value: string; }
type SplitConfig = {
    mode: 'split' | 'pick';
    strategy: 'random' | 'hash' | 'modulo' | 'attribute' | 'percentage' | 'stratified';
    variants: SplitVariantUi[];
    userIdField?: string;
    salt?: string;
    seed?: number;
    percentage?: number;
    rules?: AttributeRuleUi[];
    defaultVariant?: string;
    stratifyBy?: string;
};

@Component({
    selector: 'app-branch-split-inspector',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <section class="branch-split-inspector">
        <h3>Split / A·B / Feature Flag</h3>

        <label>Режим:
            <select [(ngModel)]="config().mode" (ngModelChange)="emit()">
                <option value="split">Split поток</option>
                <option value="pick">Pick one branch</option>
            </select>
        </label>

        <label>Стратегия:
            <select [(ngModel)]="config().strategy" (ngModelChange)="emit()">
                <option value="random">Random (weighted)</option>
                <option value="hash">Hash sticky</option>
                <option value="modulo">Modulo by id</option>
                <option value="attribute">Attribute rules</option>
                <option value="percentage">Percentage rollout</option>
                <option value="stratified">Stratified</option>
            </select>
        </label>

        @if (needsUserIdField()) {
            <label>userIdField: <input [(ngModel)]="config().userIdField" (ngModelChange)="emit()" placeholder="user_id"></label>
        }
        @if (config().strategy === 'hash' || config().strategy === 'stratified') {
            <label>salt: <input [(ngModel)]="config().salt" (ngModelChange)="emit()" placeholder="exp-checkout"></label>
        }
        @if (config().strategy === 'random') {
            <label>seed: <input type="number" [(ngModel)]="config().seed" (ngModelChange)="emit()"></label>
        }
        @if (config().strategy === 'stratified') {
            <label>stratifyBy: <input [(ngModel)]="config().stratifyBy" (ngModelChange)="emit()" placeholder="country"></label>
        }
        @if (config().strategy === 'percentage') {
            <label>percentage: <input type="number" min="0" max="100" [(ngModel)]="config().percentage" (ngModelChange)="emit()"></label>
        }
        @if (config().strategy === 'attribute') {
            <div class="rules">
                <h4>Rules</h4>
                @for (rule of config().rules ?? []; track $index; let i = $index) {
                    <div class="rule">
                        <input [(ngModel)]="rule.variant" placeholder="variant key" (ngModelChange)="emit()">
                        <input [(ngModel)]="rule.field" placeholder="field" (ngModelChange)="emit()">
                        <select [(ngModel)]="rule.op" (ngModelChange)="emit()">
                            <option value="eq">eq</option><option value="ne">ne</option>
                            <option value="in">in</option>
                            <option value="gt">gt</option><option value="gte">gte</option>
                            <option value="lt">lt</option><option value="lte">lte</option>
                        </select>
                        <input [(ngModel)]="rule.value" placeholder="value (JSON for in/array)" (ngModelChange)="emit()">
                        <button (click)="removeRule(i)">×</button>
                    </div>
                }
                <button (click)="addRule()">+ rule</button>
            </div>
            <label>defaultVariant: <input [(ngModel)]="config().defaultVariant" (ngModelChange)="emit()"></label>
        }

        <h4>Variants</h4>
        @for (v of config().variants; track $index; let i = $index) {
            <div class="variant">
                <input [(ngModel)]="v.key" placeholder="key" (ngModelChange)="emit()">
                <input [(ngModel)]="v.label" placeholder="label" (ngModelChange)="emit()">
                <input type="number" [(ngModel)]="v.weight" (ngModelChange)="emit()">
                <button (click)="removeVariant(i)">×</button>
            </div>
        }
        <button (click)="addVariant()">+ variant</button>
    </section>
    `,
    styles: [`
        .branch-split-inspector { display: flex; flex-direction: column; gap: 8px; }
        label { display: flex; flex-direction: column; font-size: 12px; }
        .rule, .variant { display: grid; grid-template-columns: 1fr 1fr 80px 1fr 24px; gap: 4px; }
    `]
})
export class BranchSplitInspectorComponent {
    node = input.required<WorkflowNode>();
    configChange = output<Record<string, unknown>>();

    readonly config = computed<SplitConfig>(() => {
        const raw = this.node().data.config as Partial<SplitConfig> | undefined;
        return {
            mode: raw?.mode ?? 'split',
            strategy: raw?.strategy ?? 'random',
            variants: raw?.variants ?? [{ key: 'A', label: 'Control', weight: 50 }, { key: 'B', label: 'Treatment', weight: 50 }],
            userIdField: raw?.userIdField,
            salt: raw?.salt,
            seed: raw?.seed,
            percentage: raw?.percentage,
            rules: raw?.rules ?? [],
            defaultVariant: raw?.defaultVariant,
            stratifyBy: raw?.stratifyBy,
        };
    });

    needsUserIdField(): boolean {
        const s = this.config().strategy;
        return s === 'hash' || s === 'modulo' || s === 'stratified' || s === 'percentage';
    }

    addVariant(): void {
        const c = this.config();
        c.variants.push({ key: '', label: '', weight: 0 });
        this.emit();
    }
    removeVariant(i: number): void {
        const c = this.config();
        c.variants.splice(i, 1);
        this.emit();
    }
    addRule(): void {
        const c = this.config();
        (c.rules ??= []).push({ variant: '', field: '', op: 'eq', value: '' });
        this.emit();
    }
    removeRule(i: number): void {
        const c = this.config();
        c.rules?.splice(i, 1);
        this.emit();
    }
    emit(): void {
        this.configChange.emit({ ...this.config() } as Record<string, unknown>);
    }
}
```

- [ ] **Step 2: Подключить в существующий InspectorComponent**

В `inspector.component.ts`:
- Импортировать `BranchSplitInspectorComponent`.
- Добавить в `imports`.
- В template добавить условный рендер:
```html
@if (activeNode()?.data?.kind === 'ab') {
    <app-branch-split-inspector
        [node]="activeNode()!"
        (configChange)="onConfigChange($event)">
    </app-branch-split-inspector>
}
```

- `onConfigChange(cfg)` должен сохранить в активный node через WorkflowService:
```typescript
onConfigChange(cfg: Record<string, unknown>): void {
    const node = this.workflowService.activeNode();
    if (!node) return;
    this.workflowService.updateNodeConfig(node.id, cfg);
}
```

(Метод `updateNodeConfig` может уже существовать — если нет, добавить простой setter в `WorkflowService`.)

- [ ] **Step 3: Smoke test в браузере**

Run: `cd frontend && npm start`
- Создать Split-ноду, открыть инспектор.
- Поменять mode, strategy, добавить variant — изменения должны сохраняться в `node.data.config`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/inspector/branch-split-inspector.component.ts \
        frontend/src/app/components/inspector/inspector.component.ts
git commit -m "feat(inspector): BranchSplitInspectorComponent — все 6 стратегий"
```

---

## Task 15: Frontend — BranchMergeInspectorComponent

**Files:**
- Create: `frontend/src/app/components/inspector/branch-merge-inspector.component.ts`
- Modify: `frontend/src/app/components/inspector/inspector.component.ts`

- [ ] **Step 1: Создать компонент**

`frontend/src/app/components/inspector/branch-merge-inspector.component.ts`:
```typescript
import { Component, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowNode } from '../../models/workflow.model';
import { WorkflowService } from '../../services/workflow.service';

@Component({
    selector: 'app-branch-merge-inspector',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <section class="branch-merge-inspector">
        <h3>Merge</h3>
        <label>tagField:
            <input [(ngModel)]="tagField" (ngModelChange)="emit()" placeholder="_variant">
        </label>
        <label>
            <input type="checkbox" [(ngModel)]="preserveExistingTag" (ngModelChange)="emit()">
            preserveExistingTag
        </label>

        <h4>Источники → variant</h4>
        <table class="sources">
            <thead><tr><th>upstream node</th><th>variant</th></tr></thead>
            <tbody>
                @for (s of sources(); track s.depId) {
                    <tr><td>{{ s.depId }}</td><td>{{ s.variant ?? '—' }}</td></tr>
                }
            </tbody>
        </table>
    </section>
    `,
    styles: [`
        .branch-merge-inspector { display: flex; flex-direction: column; gap: 8px; }
        table { width: 100%; font-size: 12px; }
        th, td { text-align: left; padding: 4px; border-bottom: 1px solid var(--border); }
    `]
})
export class BranchMergeInspectorComponent {
    node = input.required<WorkflowNode>();
    configChange = output<Record<string, unknown>>();
    private ws = inject(WorkflowService);

    tagField = '_variant';
    preserveExistingTag = true;

    readonly sources = computed(() => {
        const nodeId = this.node().id;
        return this.ws.edges()
            .filter(e => e.target === nodeId)
            .map(e => ({ depId: e.source, variant: e.data?.variant ?? null }));
    });

    constructor() {
        // initial load from config
        const cfg = this.node().data.config as { tagField?: string; preserveExistingTag?: boolean } | undefined;
        if (cfg?.tagField) this.tagField = cfg.tagField;
        if (cfg?.preserveExistingTag !== undefined) this.preserveExistingTag = cfg.preserveExistingTag;
    }

    emit(): void {
        this.configChange.emit({
            tagField: this.tagField,
            preserveExistingTag: this.preserveExistingTag,
        });
    }
}
```

- [ ] **Step 2: Подключить в InspectorComponent**

В `inspector.component.ts`:
```html
@if (activeNode()?.data?.kind === 'join') {
    <app-branch-merge-inspector
        [node]="activeNode()!"
        (configChange)="onConfigChange($event)">
    </app-branch-merge-inspector>
}
```

- [ ] **Step 3: Smoke test**

В браузере: создать Split→A→Merge и Split→B→Merge, открыть Merge — таблица source/variant должна показывать обе ветки.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/inspector/branch-merge-inspector.component.ts \
        frontend/src/app/components/inspector/inspector.component.ts
git commit -m "feat(inspector): BranchMergeInspectorComponent — tagField, sources read-only"
```

---

## Task 16: Frontend validator — новые правила

**Files:**
- Modify: `frontend/src/app/services/workflow-validator.service.ts`
- Modify: `frontend/src/app/services/workflow-validator.service.spec.ts` (создать если нет)

- [ ] **Step 1: Add failing tests**

`frontend/src/app/services/workflow-validator.service.spec.ts`:
```typescript
import { WorkflowValidatorService } from './workflow-validator.service';
import { WorkflowNode, WorkflowEdge } from '../models/workflow.model';

describe('WorkflowValidatorService — branch rules', () => {
    let svc: WorkflowValidatorService;
    beforeEach(() => { svc = new WorkflowValidatorService(); });

    function makeAbNode(config: Record<string, unknown>): WorkflowNode {
        return {
            id: 'split1', type: 'ab', position: { x: 0, y: 0 },
            data: {
                id: 'split1', kind: 'ab', label: 'S', color: '',
                successProb: 0, variants: [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }],
                randomization: 'simple',
                metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                config,
            },
        };
    }

    it('error если split edge без variant', () => {
        const trigger: WorkflowNode = { ...makeAbNode({}), id: 't', type: 'trigger',
            data: { ...makeAbNode({}).data, id: 't', kind: 'trigger', variants: [] } };
        const split = makeAbNode({
            mode: 'split', strategy: 'random',
            variants: [{ key: 'A', label: 'A', weight: 100 }],
        });
        const target: WorkflowNode = { ...makeAbNode({}), id: 'p', type: 'dataflow',
            data: { ...makeAbNode({}).data, id: 'p', kind: 'dataflow', variants: [] } };
        const edges: WorkflowEdge[] = [
            { id: 'e0', source: 't', target: 'split1' },
            { id: 'e1', source: 'split1', target: 'p' },  // нет variant
        ];
        const result = svc.validate([trigger, split, target], edges);
        expect(result.issues.some(i => i.severity === 'error' && i.message.includes('variant'))).toBe(true);
    });

    it('error если hash без userIdField', () => {
        const split = makeAbNode({
            mode: 'split', strategy: 'hash',
            variants: [{ key: 'A', label: 'A', weight: 100 }],
        });
        const trigger: WorkflowNode = { ...split, id: 't', type: 'trigger',
            data: { ...split.data, id: 't', kind: 'trigger' } };
        const result = svc.validate([trigger, split], [
            { id: 'e0', source: 't', target: 'split1' },
        ]);
        expect(result.issues.some(i => i.severity === 'error' && i.message.includes('userIdField'))).toBe(true);
    });

    it('warning если Merge с одним входом', () => {
        const trigger: WorkflowNode = { id: 't', type: 'trigger', position: {x:0,y:0},
            data: { id: 't', kind: 'trigger', label: 'T', color: '', successProb: 0, variants: [],
                randomization: 'simple', metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] }}};
        const merge: WorkflowNode = { id: 'm', type: 'join', position: {x:0,y:0},
            data: { id: 'm', kind: 'join', label: 'M', color: '', successProb: 0, variants: [],
                randomization: 'simple', metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] }}};
        const result = svc.validate([trigger, merge], [{ id: 'e1', source: 't', target: 'm' }]);
        expect(result.issues.some(i => i.severity === 'warning' && i.message.toLowerCase().includes('merge'))).toBe(true);
    });
});
```

- [ ] **Step 2: Run, FAIL**

Run: `cd frontend && npm test -- --include='**/workflow-validator.service.spec.ts' --watch=false`

- [ ] **Step 3: Add validation rules**

В `workflow-validator.service.ts::validate`, после блока существующих проверок и **до** `return this.buildResult(...)`, добавить:

```typescript
// Branch nodes validation
const splitNodes = nodes.filter(n => n.data.kind === 'ab');
for (const split of splitNodes) {
    const cfg = (split.data.config ?? {}) as {
        mode?: string;
        strategy?: string;
        variants?: Array<{ key: string; weight: number }>;
        userIdField?: string;
        stratifyBy?: string;
    };
    const variants = cfg.variants ?? [];
    const variantKeys = new Set(variants.map(v => v.key));
    const outgoing = edges.filter(e => e.source === split.id);

    for (const e of outgoing) {
        if (!e.data?.variant) {
            issues.push({
                severity: 'error',
                message: `Ребро от Split "${split.data.label}" не имеет variant`,
                nodeId: split.id,
                fix: 'Перетащите ребро из конкретной точки variant на Split-ноде',
            });
        } else if (!variantKeys.has(e.data.variant)) {
            issues.push({
                severity: 'error',
                message: `variant "${e.data.variant}" не объявлен в Split "${split.data.label}"`,
                nodeId: split.id,
                fix: 'Добавьте variant с этим key или удалите ребро',
            });
        }
    }

    const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
    if (totalWeight <= 0 && variants.length > 0) {
        issues.push({
            severity: 'error',
            message: `Сумма весов Split "${split.data.label}" должна быть > 0`,
            nodeId: split.id,
            fix: 'Установите ненулевые weight у вариантов',
        });
    }

    const s = cfg.strategy ?? 'random';
    const needsUserId = s === 'hash' || s === 'modulo' || s === 'stratified' || s === 'percentage';
    if (needsUserId && !cfg.userIdField) {
        issues.push({
            severity: 'error',
            message: `Стратегия "${s}" требует userIdField у Split "${split.data.label}"`,
            nodeId: split.id,
            fix: 'Заполните userIdField в инспекторе',
        });
    }
    if (s === 'stratified' && !cfg.stratifyBy) {
        issues.push({
            severity: 'error',
            message: `Стратегия stratified требует stratifyBy у Split "${split.data.label}"`,
            nodeId: split.id,
            fix: 'Заполните stratifyBy в инспекторе',
        });
    }

    // Variants без исходящих рёбер
    const usedKeys = new Set(outgoing.map(e => e.data?.variant).filter(Boolean));
    for (const v of variants) {
        if (!usedKeys.has(v.key)) {
            issues.push({
                severity: 'warning',
                message: `Variant "${v.key}" Split "${split.data.label}" без исходящего ребра`,
                nodeId: split.id,
                fix: 'Добавьте ребро от этого variant или удалите его',
            });
        }
    }
}

const mergeNodes = nodes.filter(n => n.data.kind === 'join');
for (const m of mergeNodes) {
    const incoming = edges.filter(e => e.target === m.id).length;
    if (incoming === 1) {
        issues.push({
            severity: 'warning',
            message: `Merge "${m.data.label}" имеет только один вход — эквивалентен passthrough`,
            nodeId: m.id,
            fix: 'Подключите как минимум 2 ветки или удалите Merge',
        });
    }
}
```

- [ ] **Step 4: Run tests, PASS**

Run: `cd frontend && npm test -- --include='**/workflow-validator.service.spec.ts' --watch=false`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/services/workflow-validator.service.ts \
        frontend/src/app/services/workflow-validator.service.spec.ts
git commit -m "feat(validator): правила для Split (variant, weights, userIdField) и Merge"
```

---

## Task 17: Manual smoke test — full happy path

**Files:** — (никаких code-изменений; ручная проверка end-to-end)

- [ ] **Step 1: Запустить бэкенд и фронт**

```bash
# терминал 1
cd backend && docker compose up -d && ./mvnw spring-boot:run
# терминал 2
cd frontend && npm start
```

- [ ] **Step 2: Сценарий split-mode**

В UI:
1. Создать новый workflow.
2. Перетащить Trigger (Manual), Split, две Filter-ноды (`{}` config), Merge.
3. Соединить: Trigger → Split, Split[A] → Filter1, Split[B] → Filter2, Filter1 → Merge, Filter2 → Merge.
4. Открыть инспектор Split, выбрать strategy=hash, userIdField=user_id, salt=test1.
5. В Trigger run input указать `[{"user_id":"u1"},{"user_id":"u2"},...,{"user_id":"u20"}]`.
6. Execute. Open Run details: убедиться, что Merge.output — массив из 20 элементов, у каждого есть `_variant: "A"` или `"B"`.

- [ ] **Step 3: Сценарий pick-mode**

1. На Split поменять mode=pick, strategy=attribute с правилом `country=='RU' → A`, default=B.
2. Run input `[{"country":"RU"}]`.
3. Execute. Проверить, что NodeRun у Filter2 — status=skipped, Merge.output — только активная ветка.

- [ ] **Step 4: Сценарий validation**

1. Создать Split с edge без variant. На "Execute" UI должен показать error из validator'а.
2. Создать Merge с одним входом — должен показать warning.

- [ ] **Step 5: Document выводы**

Если всё работает — task завершён. Если что-то сломано — открыть issue / завести follow-up.

---

## Task 18: Обновить memory-bank context.md

**Files:**
- Modify: `memory-bank/context.md`

- [ ] **Step 1: Read current context.md**

Run: `cat memory-bank/context.md`

- [ ] **Step 2: Дописать одну строку про новую фичу**

Заменить блок «Current state» — добавить пункт:
```markdown
- ✅ Branch nodes (split + merge): 6 стратегий разделения, real edge.variant routing, skip-логика для pick-mode
```

И обновить «One-line focus» если работа над этой фичей завершена.

- [ ] **Step 3: Commit**

```bash
git add memory-bank/context.md
git commit -m "docs(memory-bank): отметить завершение branch.split / branch.merge"
```

---

## Self-Review

### Spec coverage check

- §1 Goal — Task 4, 6, 7, 8 (split, merge, executor routing).
- §2 Architecture — Task 4 (split-mode envelope), 5 (pick-mode), 7-8 (executor).
- §3 Split contract — Task 2 (strategies), 4 (executor split-mode), 5 (pick-mode).
- §3 Config validation внутри executor'а — Task 2 (require в strategies), 4 (parseContext).
- §4 Merge contract — Task 6.
- §5 Executor changes — Task 1 (DTO), 7 (buildNodeInput), 8 (skip-логика).
- §6 Graph validation — Task 9 (backend), 16 (frontend).
- §7 Frontend — Task 10 (mapper), 11 (palette), 12 (templates), 13 (canvas multi-handle), 14 (split inspector), 15 (merge inspector).
- §8 Backwards compatibility — Task 10 (mapper сохраняет `__originalKind` fallback, нет migration).
- §9 Testing — Task 2, 3, 4, 5, 6 (executor unit), 8 (integration), 10, 16 (frontend specs), 17 (manual).
- §10 Scope estimate — соответствует.

### Placeholder scan
- Нет TBD/TODO/«add appropriate error handling»/«similar to Task N».
- Все code-блоки содержат рабочий код.
- Опциональные mapper-функции в Task 10 — пометил «если названия другие — поправить» с указанием места поиска; это допустимо т.к. точное имя зависит от текущего состояния файла.

### Type consistency
- `SplitVariant{key,label,weight}` — везде одинаково.
- `SplitContext` — поля совпадают между BranchSplitStrategies.kt и BranchSplitNodeExecutor.kt.
- `SplitEnvelope.resolveForEdge(upstream, edgeVariant)` — тот же signature в Task 3 и Task 7.
- `branch.split` / `branch.merge` strings — везде одинаково.
- `_variant` tag field — везде одинаково.
- `mode` enum: `split` | `pick` — везде одинаково.
- `inputVariants` envelope key — введён в Task 7, используется в Task 6 (Merge) и Task 8 (тесты).

### Известные риски

1. **Task 8 integration test** требует существующих helper-методов в `RunEnqueueService`/`RunQueryService`/`NodeRunRepository` (`startSync`, `outputs`, `findAllByRunId`, `findRun`). Если их нет — нужно либо использовать существующие API, либо добавить минимальные test-only методы. План указывает это в Step 1 явно.

2. **Task 13 canvas multi-handle** — самая объёмная фронт-задача. Файл canvas 1065 строк; если current draw-сессия архитектурно несовместима с variant-параметром — может потребоваться 2-3 итерации.

3. **Task 17 manual** — финальная sanity check, не автотест. Если backend Docker не доступен у engineer'а — пропустить с пометкой "blocked, нужно проверить в CI".

