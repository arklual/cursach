package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DataflowNodeExecutorsExtraTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()
    private fun json(s: String): JsonNode = mapper.readTree(s)

    @Test
    fun `filter unwraps envelope from-key`() {
        val executor = FilterNodeExecutor(mapper)
        val envelope = json("""{"runInput":{},"inputs":{"src":[{"v":1},{"v":2}]}}""")
        val config = json("""{"from":"src","field":"v","op":"gte","value":2}""")
        val out = executor.execute("n", config, envelope)
        assertEquals(1, out.size())
        assertEquals(2, out[0]["v"].asInt())
    }

    @Test
    fun `filter unwraps envelope single upstream when from omitted`() {
        val executor = FilterNodeExecutor(mapper)
        val envelope = json("""{"runInput":{},"inputs":{"only":[1,2,3]}}""")
        val out = executor.execute("n", json("""{}"""), envelope)
        assertEquals(3, out.size())
    }

    @Test
    fun `filter keeps envelope as-is when multiple upstreams and no from`() {
        val executor = FilterNodeExecutor(mapper)
        val envelope = json("""{"runInput":{},"inputs":{"a":[1],"b":[2]}}""")
        val out = executor.execute("n", null, envelope)
        assertTrue(out.isArray)
    }

    @Test
    fun `filter passes through when from key is missing`() {
        val executor = FilterNodeExecutor(mapper)
        val envelope = json("""{"runInput":{},"inputs":{"x":[1,2]}}""")
        val out = executor.execute("n", json("""{"from":"missing"}"""), envelope)
        assertEquals(2, out.size())
    }

    @Test
    fun `filter non-object input falls through unchanged`() {
        val executor = FilterNodeExecutor(mapper)
        val out = executor.execute("n", null, json("""[1,0,2,""]"""))
        assertEquals(2, out.size())
    }

    @Test
    fun `filter null input becomes empty array`() {
        val executor = FilterNodeExecutor(mapper)
        val out = executor.execute("n", null, mapper.nullNode())
        assertTrue(out.isArray)
        assertEquals(0, out.size())
    }

    @Test
    fun `filter wraps non-array single item`() {
        val executor = FilterNodeExecutor(mapper)
        val out = executor.execute("n", null, json("""{"v":1}"""))
        assertEquals(1, out.size())
    }

    @Test
    fun `filter rejects unknown op for numbers`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"x":1}]""")
        val cfg = json("""{"field":"x","op":"wibble","value":1}""")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n", cfg, input)
        }
    }

    @Test
    fun `filter rejects gt on strings`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"x":"hi"}]""")
        val cfg = json("""{"field":"x","op":"gt","value":"lo"}""")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n", cfg, input)
        }
    }

    @Test
    fun `filter eq on strings works`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"x":"a"},{"x":"b"}]""")
        val cfg = json("""{"field":"x","op":"eq","value":"a"}""")
        val out = executor.execute("n", cfg, input)
        assertEquals(1, out.size())
        assertEquals("a", out[0]["x"].asText())
    }

    @Test
    fun `filter ne for numbers`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"x":1},{"x":2}]""")
        val cfg = json("""{"field":"x","op":"ne","value":1}""")
        val out = executor.execute("n", cfg, input)
        assertEquals(1, out.size())
        assertEquals(2, out[0]["x"].asInt())
    }

    @Test
    fun `filter all numeric ops`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"x":1},{"x":2},{"x":3},{"x":4}]""")
        assertEquals(1, executor.execute("n", json("""{"field":"x","op":"eq","value":3}"""), input).size())
        assertEquals(3, executor.execute("n", json("""{"field":"x","op":"ne","value":3}"""), input).size())
        assertEquals(2, executor.execute("n", json("""{"field":"x","op":"gte","value":3}"""), input).size())
        assertEquals(3, executor.execute("n", json("""{"field":"x","op":"lte","value":3}"""), input).size())
        assertEquals(2, executor.execute("n", json("""{"field":"x","op":"lt","value":3}"""), input).size())
        assertEquals(1, executor.execute("n", json("""{"field":"x","op":"gt","value":3}"""), input).size())
    }

    @Test
    fun `filter without field compares element itself`() {
        val executor = FilterNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"op":"gt","value":5}"""), json("""[3,7,9]"""))
        assertEquals(2, out.size())
    }

    @Test
    fun `map wrap creates wrapping object`() {
        val executor = MapNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"wrap":"value"}"""), json("""[1,2,3]"""))
        assertEquals(3, out.size())
        assertEquals(1, out[0]["value"].asInt())
    }

    @Test
    fun `map select only specified keys`() {
        val executor = MapNodeExecutor(mapper)
        val out = executor.execute(
            "n",
            json("""{"select":["id"]}"""),
            json("""[{"id":1,"extra":"x"}]"""),
        )
        assertEquals(1, out[0].size())
        assertEquals(1, out[0]["id"].asInt())
    }

    @Test
    fun `map rename swaps field names`() {
        val executor = MapNodeExecutor(mapper)
        val out = executor.execute(
            "n",
            json("""{"rename":{"newId":"id"}}"""),
            json("""[{"id":1}]"""),
        )
        assertEquals(1, out[0]["newId"].asInt())
    }

    @Test
    fun `map identity when item is not object`() {
        val executor = MapNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"select":["x"]}"""), json("""[1,2,3]"""))
        assertEquals(3, out.size())
    }

    @Test
    fun `reduce sum`() {
        val executor = ReduceNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"op":"sum","field":"x"}"""), json("""[{"x":1},{"x":2},{"x":3}]"""))
        assertEquals(6.0, out["result"].asDouble())
    }

    @Test
    fun `reduce min and max and avg`() {
        val executor = ReduceNodeExecutor(mapper)
        val input = json("""[{"x":1},{"x":3},{"x":5}]""")
        assertEquals(1.0, executor.execute("n", json("""{"op":"min","field":"x"}"""), input)["result"].asDouble())
        assertEquals(5.0, executor.execute("n", json("""{"op":"max","field":"x"}"""), input)["result"].asDouble())
        assertEquals(3.0, executor.execute("n", json("""{"op":"avg","field":"x"}"""), input)["result"].asDouble())
    }

    @Test
    fun `reduce count works without op`() {
        val executor = ReduceNodeExecutor(mapper)
        val out = executor.execute("n", null, json("""[1,2,3,4]"""))
        assertEquals(4, out["result"].asInt())
    }

    @Test
    fun `reduce empty input returns zero`() {
        val executor = ReduceNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"op":"sum","field":"x"}"""), json("""[]"""))
        assertEquals(0, out["result"].asInt())
    }

    @Test
    fun `reduce unknown op throws`() {
        val executor = ReduceNodeExecutor(mapper)
        val input = json("""[{"x":1}]""")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n", json("""{"op":"wibble","field":"x"}"""), input)
        }
    }

    @Test
    fun `reduce skips non-numeric values`() {
        val executor = ReduceNodeExecutor(mapper)
        val out = executor.execute(
            "n",
            json("""{"op":"sum","field":"x"}"""),
            json("""[{"x":1},{"x":"oops"},{"x":2}]"""),
        )
        assertEquals(3.0, out["result"].asDouble())
    }

    @Test
    fun `foreach passthrough preserves array`() {
        val executor = ForeachNodeExecutor(mapper)
        val out = executor.execute("n", null, json("""[1,2,3]"""))
        assertEquals(3, out.size())
    }

    @Test
    fun `foreach wraps non-array input`() {
        val executor = ForeachNodeExecutor(mapper)
        val out = executor.execute("n", null, json("""{"x":1}"""))
        assertEquals(1, out.size())
    }

    @Test
    fun `flatmap concats nested arrays via field`() {
        val executor = FlatMapNodeExecutor(mapper)
        val out = executor.execute(
            "n",
            json("""{"field":"items"}"""),
            json("""[{"items":[1,2]},{"items":[3,4]}]"""),
        )
        assertEquals(4, out.size())
        assertEquals(1, out[0].asInt())
    }

    @Test
    fun `flatmap without field flattens array of arrays`() {
        val executor = FlatMapNodeExecutor(mapper)
        val out = executor.execute("n", null, json("""[[1,2],[3,4]]"""))
        assertEquals(4, out.size())
    }

    @Test
    fun `flatmap adds scalar item when sub is not array`() {
        val executor = FlatMapNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"field":"v"}"""), json("""[{"v":1},{"v":2}]"""))
        assertEquals(2, out.size())
    }

    @Test
    fun `flatmap skips nulls`() {
        val executor = FlatMapNodeExecutor(mapper)
        val out = executor.execute("n", json("""{"field":"v"}"""), json("""[{"v":null},{"v":1}]"""))
        assertEquals(1, out.size())
    }
}
