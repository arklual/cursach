package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BranchSplitStrategiesExtraTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()
    private fun obj(s: String): JsonNode = mapper.readTree(s)

    private val ab = listOf(SplitVariant("A", "A", 50), SplitVariant("B", "B", 50))

    @Test
    fun `unknown strategy throws`() {
        val ctx = SplitContext(strategy = "weird", variants = ab)
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("{}"), ctx)
        }
    }

    @Test
    fun `random rejects zero total weight`() {
        val ctx = SplitContext(
            strategy = "random",
            variants = listOf(SplitVariant("a", "a", 0), SplitVariant("b", "b", 0)),
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("{}"), ctx)
        }
    }

    @Test
    fun `hash rejects zero total weight`() {
        val ctx = SplitContext(
            strategy = "hash",
            variants = listOf(SplitVariant("a", "a", 0)),
            userIdField = "id",
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), ctx)
        }
    }

    @Test
    fun `hash requires userIdField`() {
        val ctx = SplitContext(strategy = "hash", variants = ab, userIdField = null)
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), ctx)
        }
    }

    @Test
    fun `hash throws when item is missing user id field`() {
        val ctx = SplitContext(strategy = "hash", variants = ab, userIdField = "missing")
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"other":"x"}"""), ctx)
        }
    }

    @Test
    fun `modulo deterministic and respects weights`() {
        val ctx = SplitContext(
            strategy = "modulo",
            variants = listOf(SplitVariant("A", "A", 70), SplitVariant("B", "B", 30)),
            userIdField = "id",
        )
        val results = (1..1000).map {
            BranchSplitStrategies.assignVariant(obj("""{"id":"u-$it"}"""), ctx)
        }
        val aShare = results.count { it == "A" }.toDouble() / 1000
        assertTrue(aShare in 0.6..0.8, "Expected ~0.70, got $aShare")
    }

    @Test
    fun `modulo missing total throws`() {
        val ctx = SplitContext(
            strategy = "modulo",
            variants = listOf(SplitVariant("a", "a", 0)),
            userIdField = "id",
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), ctx)
        }
    }

    @Test
    fun `attribute returns null when no rule matches and no default`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "country", "eq", mapper.readTree("\"RU\""))),
            defaultVariant = null,
        )
        val out = BranchSplitStrategies.assignVariant(obj("""{"country":"US"}"""), ctx)
        assertNull(out)
    }

    @Test
    fun `attribute skips rule when field absent and continues to next`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(
                AttributeRule("A", "missing-field", "eq", mapper.readTree("\"x\"")),
                AttributeRule("B", "plan", "eq", mapper.readTree("\"pro\"")),
            ),
            defaultVariant = null,
        )
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"plan":"pro"}"""), ctx))
    }

    @Test
    fun `attribute op ne`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "plan", "ne", mapper.readTree("\"free\""))),
            defaultVariant = "B",
        )
        assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"plan":"pro"}"""), ctx))
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"plan":"free"}"""), ctx))
    }

    @Test
    fun `attribute op gt and gte for numbers`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(
                AttributeRule("A", "amount", "gt", mapper.readTree("100")),
            ),
            defaultVariant = "B",
        )
        assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"amount":150}"""), ctx))
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"amount":50}"""), ctx))

        val ctxGte = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "amount", "gte", mapper.readTree("100"))),
            defaultVariant = "B",
        )
        assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"amount":100}"""), ctxGte))
    }

    @Test
    fun `attribute op lt and lte for numbers`() {
        val ctxLt = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "amount", "lt", mapper.readTree("100"))),
            defaultVariant = "B",
        )
        assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"amount":99}"""), ctxLt))
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"amount":100}"""), ctxLt))

        val ctxLte = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "amount", "lte", mapper.readTree("100"))),
            defaultVariant = "B",
        )
        assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"amount":100}"""), ctxLte))
    }

    @Test
    fun `attribute gt false when value not number`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "amount", "gt", mapper.readTree("\"x\""))),
            defaultVariant = "B",
        )
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"amount":150}"""), ctx))
    }

    @Test
    fun `attribute unknown op throws`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "plan", "wibble", mapper.readTree("\"pro\""))),
            defaultVariant = "B",
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"plan":"pro"}"""), ctx)
        }
    }

    @Test
    fun `attribute in returns default when value not in array`() {
        val ctx = SplitContext(
            strategy = "attribute", variants = ab,
            rules = listOf(AttributeRule("A", "country", "in", mapper.readTree("""["RU","BY"]"""))),
            defaultVariant = "B",
        )
        assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"country":"US"}"""), ctx))
    }

    @Test
    fun `percentage requires exactly 2 variants`() {
        val ctx = SplitContext(
            strategy = "percentage", variants = ab + SplitVariant("C", "C", 0),
            userIdField = "id", percentage = 10,
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), ctx)
        }
    }

    @Test
    fun `percentage missing percentage throws`() {
        val ctx = SplitContext(
            strategy = "percentage", variants = ab,
            userIdField = "id", percentage = null,
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), ctx)
        }
    }

    @Test
    fun `percentage rejects negative or over-100`() {
        val negCtx = SplitContext(
            strategy = "percentage", variants = ab,
            userIdField = "id", percentage = -1,
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), negCtx)
        }
        val overCtx = SplitContext(
            strategy = "percentage", variants = ab,
            userIdField = "id", percentage = 101,
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"x"}"""), overCtx)
        }
    }

    @Test
    fun `percentage 0 picks second variant, 100 picks first`() {
        val zero = SplitContext(
            strategy = "percentage", variants = ab,
            userIdField = "id", percentage = 0,
        )
        val hundred = SplitContext(
            strategy = "percentage", variants = ab,
            userIdField = "id", percentage = 100,
        )
        (1..50).forEach { i ->
            assertEquals("B", BranchSplitStrategies.assignVariant(obj("""{"id":"u-$i"}"""), zero))
            assertEquals("A", BranchSplitStrategies.assignVariant(obj("""{"id":"u-$i"}"""), hundred))
        }
    }

    @Test
    fun `stratified requires stratifyBy`() {
        val ctx = SplitContext(
            strategy = "stratified", variants = ab,
            userIdField = "id", stratifyBy = null,
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"u","country":"RU"}"""), ctx)
        }
    }

    @Test
    fun `stratified rejects zero weight`() {
        val ctx = SplitContext(
            strategy = "stratified",
            variants = listOf(SplitVariant("a", "a", 0)),
            userIdField = "id", stratifyBy = "country",
        )
        assertThrows(IllegalArgumentException::class.java) {
            BranchSplitStrategies.assignVariant(obj("""{"id":"u","country":"RU"}"""), ctx)
        }
    }

    @Test
    fun `stratified empty stratum still deterministic by user`() {
        val ctx = SplitContext(
            strategy = "stratified", variants = ab,
            userIdField = "id", stratifyBy = "missing",
        )
        val r1 = BranchSplitStrategies.assignVariant(obj("""{"id":"u"}"""), ctx)
        val r2 = BranchSplitStrategies.assignVariant(obj("""{"id":"u"}"""), ctx)
        assertEquals(r1, r2)
        assertNotNull(r1)
    }

    @Test
    fun `random seedless still produces a key`() {
        val ctx = SplitContext(strategy = "random", variants = ab, seed = null)
        val r = BranchSplitStrategies.assignVariant(obj("{}"), ctx)
        assertTrue(r == "A" || r == "B")
    }

    @Test
    fun `hash without salt still deterministic`() {
        val ctx = SplitContext(strategy = "hash", variants = ab, userIdField = "id", salt = null)
        val r1 = BranchSplitStrategies.assignVariant(obj("""{"id":"u"}"""), ctx)
        val r2 = BranchSplitStrategies.assignVariant(obj("""{"id":"u"}"""), ctx)
        assertEquals(r1, r2)
    }
}
