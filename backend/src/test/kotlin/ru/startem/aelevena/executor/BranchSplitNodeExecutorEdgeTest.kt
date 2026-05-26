package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Edge-case coverage for BranchSplitNodeExecutor that the happy-path suite does not hit:
 * config validation, envelope unwrapping branches, and unknown-mode handling.
 */
class BranchSplitNodeExecutorEdgeTest {
    private val mapper: ObjectMapper = jacksonObjectMapper()
    private val executor = BranchSplitNodeExecutor(mapper)
    private fun j(s: String): JsonNode = mapper.readTree(s)

    @Test
    fun `null config rejected with IllegalArgumentException`() {
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", null, mapper.createArrayNode())
        }
    }

    @Test
    fun `non-object config rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", j("""[1,2,3]"""), mapper.createArrayNode())
        }
    }

    @Test
    fun `empty variants array rejected`() {
        val cfg = j("""{"mode":"split","variants":[]}""")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", cfg, mapper.createArrayNode())
        }
    }

    @Test
    fun `missing variants field rejected`() {
        val cfg = j("""{"mode":"split"}""")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", cfg, mapper.createArrayNode())
        }
    }

    @Test
    fun `unknown mode rejected`() {
        val cfg = j("""{
            "mode":"bogus",
            "strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        val thrown = assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", cfg, mapper.createArrayNode())
        }
        assertTrue(thrown.message!!.contains("bogus"))
    }

    @Test
    fun `default mode is split when not specified`() {
        val cfg = j("""{
            "strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        val out = executor.execute("n1", cfg, j("""[{"id":1}]"""))
        assertEquals("split", out.get("mode").asText())
    }

    @Test
    fun `envelope with multiple inputs keys is passed through unchanged`() {
        val cfg = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        // Two upstream nodes → the executor does not collapse to a single input.
        val envelope = j("""{"inputs":{"a":[{"id":1}],"b":[{"id":2}]}}""")
        val out = executor.execute("n1", cfg, envelope)
        // The whole envelope object is wrapped into a single-element array → exactly one bucket entry.
        assertEquals(1, out.get("variants").get("A").size())
    }

    @Test
    fun `envelope with no inputs and runInput uses runInput`() {
        val cfg = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        val envelope = j("""{"inputs":{},"runInput":[{"id":1},{"id":2}]}""")
        val out = executor.execute("n1", cfg, envelope)
        assertEquals(2, out.get("variants").get("A").size())
    }

    @Test
    fun `envelope with non-object inputs is passed through unchanged`() {
        val cfg = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        val envelope = j("""{"inputs":[1,2,3]}""")
        val out = executor.execute("n1", cfg, envelope)
        // Object envelope itself becomes one element in a single-element array since inputs is array, not object.
        assertEquals(1, out.get("variants").get("A").size())
    }

    @Test
    fun `null input handled as empty array`() {
        val cfg = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        val out = executor.execute("n1", cfg, mapper.nullNode())
        assertEquals(0, out.get("variants").get("A").size())
    }

    @Test
    fun `non-array non-null input wrapped into single-element array`() {
        val cfg = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        val out = executor.execute("n1", cfg, j("""{"id":7}"""))
        assertEquals(1, out.get("variants").get("A").size())
        assertEquals(7, out.get("variants").get("A").get(0).get("id").asInt())
    }

    @Test
    fun `attribute rules with non-array rules field ignored`() {
        val cfg = j("""{
            "mode":"pick","strategy":"attribute",
            "rules":{"not":"array"},
            "defaultVariant":"A",
            "variants":[{"key":"A","label":"A","weight":1},{"key":"B","label":"B","weight":1}]
        }""")
        val out = executor.execute("n1", cfg, mapper.createArrayNode())
        assertEquals("A", out.get("chosen").asText())
    }

    @Test
    fun `variant label defaults to key when missing`() {
        val cfg = j("""{
            "mode":"split","strategy":"random","seed":1,
            "variants":[{"key":"A","weight":1}]
        }""")
        // Should not crash even though label is missing.
        val out = executor.execute("n1", cfg, j("""[{"x":1}]"""))
        assertNotNull(out.get("variants").get("A"))
    }

    @Test
    fun `unknown strategy throws`() {
        val cfg = j("""{
            "mode":"split","strategy":"made-up",
            "variants":[{"key":"A","label":"A","weight":1}]
        }""")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", cfg, j("""[{"id":1}]"""))
        }
    }

    @Test
    fun `pick mode unknown variant in attribute returns null - falls back to first`() {
        // attribute strategy without matching rule and no defaultVariant → assignVariant returns null
        // → pick path uses ctx.variants.first().key
        val cfg = j("""{
            "mode":"pick","strategy":"attribute",
            "rules":[],
            "variants":[{"key":"A","label":"A","weight":1},{"key":"B","label":"B","weight":1}]
        }""")
        val out = executor.execute("n1", cfg, j("""[{"x":1}]"""))
        assertEquals("A", out.get("chosen").asText())
    }
}
