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
