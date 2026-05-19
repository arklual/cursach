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
