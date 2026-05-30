package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DataflowExpressionTest {

    private val mapper = ObjectMapper()

    private fun cfg(expression: String, vararg extra: Pair<String, Any>) =
        mapper.createObjectNode().apply {
            put("expression", expression)
            extra.forEach { (k, v) ->
                when (v) {
                    is Int -> put(k, v)
                    is String -> put(k, v)
                    else -> putPOJO(k, v)
                }
            }
        }

    @Test
    fun `filter keeps items where expression is true`() {
        val input = mapper.readTree("""[{"age":15},{"age":20},{"age":18},{"age":40}]""")
        val out = FilterNodeExecutor(mapper).execute("f", cfg("item.age > 18"), input)
        assertTrue(out.isArray)
        assertEquals(2, out.size())
        assertEquals(setOf(20, 40), out.map { it.get("age").asInt() }.toSet())
    }

    @Test
    fun `map applies transformation to each element`() {
        val input = mapper.readTree("""[{"name":"alice"},{"name":"bob"}]""")
        val out = MapNodeExecutor(mapper).execute("m", cfg("{name: item.name.toUpperCase()}"), input)
        assertEquals(2, out.size())
        assertEquals("ALICE", out[0].get("name").asText())
        assertEquals("BOB", out[1].get("name").asText())
    }

    @Test
    fun `reduce accumulates with initial value`() {
        val input = mapper.readTree("""[{"price":10},{"price":5},{"price":2}]""")
        val out = ReduceNodeExecutor(mapper).execute("r", cfg("acc + item.price", "initialValue" to 0), input)
        assertEquals(17.0, out.asDouble())
    }

    @Test
    fun `foreach returns input list unchanged`() {
        val input = mapper.readTree("""[{"id":1},{"id":2}]""")
        val out = ForeachNodeExecutor(mapper).execute("fe", cfg("item.id"), input)
        assertEquals(input, out)
    }

    @Test
    fun `flatmap flattens nested children lists`() {
        val input = mapper.readTree("""[{"children":[1,2]},{"children":[3]},{"children":[]}]""")
        val out = FlatMapNodeExecutor(mapper).execute("fm", cfg("item.children"), input)
        assertEquals(3, out.size())
        assertEquals(listOf(1, 2, 3), out.map { it.asInt() })
    }

    @Test
    fun `invalid expression type surfaces as failure`() {
        val input = mapper.readTree("""[{"age":15}]""")
        org.junit.jupiter.api.assertThrows<Exception> {
            FilterNodeExecutor(mapper).execute("f", cfg("nope.age > 18"), input)
        }
    }
}
