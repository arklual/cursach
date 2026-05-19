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
