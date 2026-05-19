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
        val items = (0 until out.size()).map { out.get(it) }
        val a = items.first { it.get("id").asInt() == 1 }
        val b = items.first { it.get("id").asInt() == 2 }
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
