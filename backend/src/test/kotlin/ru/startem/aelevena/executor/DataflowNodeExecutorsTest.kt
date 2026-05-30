package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DataflowNodeExecutorsTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()

    private fun json(s: String): JsonNode = mapper.readTree(s)

    @Test
    fun `filter gt оставляет элементы, у которых поле больше value`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"id":1,"amount":50},{"id":2,"amount":150},{"id":3,"amount":200}]""")
        val config = json("""{"field":"amount","op":"gt","value":100}""")

        val out = executor.execute("n1", config, input)
        assertTrue(out.isArray)
        assertEquals(2, out.size())
        assertEquals(2, out[0]["id"].asInt())
        assertEquals(3, out[1]["id"].asInt())
    }

    @Test
    fun `filter eq по строке`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[{"plan":"free"},{"plan":"pro"},{"plan":"team"}]""")
        val config = json("""{"field":"plan","op":"eq","value":"pro"}""")

        val out = executor.execute("n1", config, input)
        assertEquals(1, out.size())
        assertEquals("pro", out[0]["plan"].asText())
    }

    @Test
    fun `filter без op оставляет truthy`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""[1, 0, 2, "", "x", null]""")
        val out = executor.execute("n1", null, input)
        assertEquals(3, out.size())
    }

    @Test
    fun `filter одиночный объект оборачивается в массив`() {
        val executor = FilterNodeExecutor(mapper)
        val input = json("""{"amount":150}""")
        val config = json("""{"field":"amount","op":"gt","value":100}""")
        val out = executor.execute("n1", config, input)
        assertEquals(1, out.size())
    }

    @Test
    fun `map select оставляет только указанные поля`() {
        val executor = MapNodeExecutor(mapper)
        val input = json("""[{"id":1,"amount":50,"plan":"pro"},{"id":2,"amount":200,"plan":"team"}]""")
        val config = json("""{"select":["id","amount"]}""")

        val out = executor.execute("n1", config, input)
        assertEquals(2, out.size())
        assertEquals(1, out[0]["id"].asInt())
        assertEquals(50, out[0]["amount"].asInt())
        assertTrue(out[0].get("plan") == null)
    }

    @Test
    fun `map rename меняет имена полей`() {
        val executor = MapNodeExecutor(mapper)
        val input = json("""[{"a":1,"b":2}]""")
        val config = json("""{"rename":{"x":"a","y":"b"}}""")
        val out = executor.execute("n1", config, input)
        assertEquals(1, out[0]["x"].asInt())
        assertEquals(2, out[0]["y"].asInt())
    }

    @Test
    fun `map wrap оборачивает каждый элемент в объект с полем`() {
        val executor = MapNodeExecutor(mapper)
        val input = json("""[1,2,3]""")
        val config = json("""{"wrap":"value"}""")
        val out = executor.execute("n1", config, input)
        assertEquals(3, out.size())
        assertEquals(1, out[0]["value"].asInt())
    }

    @Test
    fun `reduce sum по полю amount`() {
        val executor = ReduceNodeExecutor(mapper)
        val input = json("""[{"amount":10},{"amount":20},{"amount":30}]""")
        val config = json("""{"op":"sum","field":"amount"}""")
        val out = executor.execute("n1", config, input)
        assertEquals(60.0, out["result"].asDouble())
    }

    @Test
    fun `reduce count без поля`() {
        val executor = ReduceNodeExecutor(mapper)
        val input = json("""[{"x":1},{"x":2},{"x":3},{"x":4}]""")
        val config = json("""{"op":"count"}""")
        val out = executor.execute("n1", config, input)
        assertEquals(4, out["result"].asInt())
    }

    @Test
    fun `reduce avg на пустом массиве возвращает 0`() {
        val executor = ReduceNodeExecutor(mapper)
        val input = json("""[]""")
        val config = json("""{"op":"avg","field":"x"}""")
        val out = executor.execute("n1", config, input)
        assertEquals(0, out["result"].asInt())
    }

    @Test
    fun `reduce min и max`() {
        val executor = ReduceNodeExecutor(mapper)
        val input = json("""[5, 1, 9, 3]""")
        assertEquals(1.0, executor.execute("n1", json("""{"op":"min"}"""), input)["result"].asDouble())
        assertEquals(9.0, executor.execute("n1", json("""{"op":"max"}"""), input)["result"].asDouble())
    }

    @Test
    fun `foreach возвращает входной массив как есть`() {
        val executor = ForeachNodeExecutor(mapper)
        val input = json("""[1,2,3]""")
        val out = executor.execute("n1", null, input)
        assertEquals(input, out)
    }

    @Test
    fun `foreach оборачивает одиночный элемент в массив`() {
        val executor = ForeachNodeExecutor(mapper)
        val input = json("""{"x":1}""")
        val out = executor.execute("n1", null, input)
        assertTrue(out.isArray)
        assertEquals(1, out.size())
    }

    @Test
    fun `flatmap по полю items разворачивает массив массивов`() {
        val executor = FlatMapNodeExecutor(mapper)
        val input = json("""[{"items":[1,2]},{"items":[3,4]}]""")
        val config = json("""{"field":"items"}""")
        val out = executor.execute("n1", config, input)
        assertEquals(4, out.size())
        assertEquals(1, out[0].asInt())
        assertEquals(4, out[3].asInt())
    }

    @Test
    fun `flatmap без field — input должен быть массив массивов`() {
        val executor = FlatMapNodeExecutor(mapper)
        val input = json("""[[1,2],[3,4,5]]""")
        val out = executor.execute("n1", null, input)
        assertEquals(5, out.size())
    }

    @Test
    fun `все executor'ы имеют корректные type-keys`() {
        assertEquals("dataflow.filter", FilterNodeExecutor(mapper).type)
        assertEquals("dataflow.map", MapNodeExecutor(mapper).type)
        assertEquals("dataflow.reduce", ReduceNodeExecutor(mapper).type)
        assertEquals("dataflow.foreach", ForeachNodeExecutor(mapper).type)
        assertEquals("dataflow.flatmap", FlatMapNodeExecutor(mapper).type)
    }
}
