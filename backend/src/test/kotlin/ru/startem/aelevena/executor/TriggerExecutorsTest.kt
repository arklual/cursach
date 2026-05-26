package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Trigger executors are pure passthroughs over `runInput`. Test both the present and
 * missing-key branches for each subtype so JaCoCo flips both arms of the `?: NullNode.instance`.
 */
class TriggerExecutorsTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()

    @Test
    fun `webhook executor returns runInput verbatim`() {
        val exec = TriggerWebhookExecutor()
        assertEquals("trigger.webhook", exec.type)
        val input = mapper.readTree("""{"runInput":{"k":"v"}}""")
        val out = exec.execute("n", null, input)
        assertEquals("v", out.get("k").asText())
    }

    @Test
    fun `webhook executor returns NullNode when runInput missing`() {
        val exec = TriggerWebhookExecutor()
        val out = exec.execute("n", null, mapper.createObjectNode())
        assertTrue(out.isNull)
    }

    @Test
    fun `cron executor passes runInput through and identifies as cron`() {
        val exec = TriggerCronExecutor()
        assertEquals("trigger.cron", exec.type)
        val input = mapper.readTree("""{"runInput":[1,2,3]}""")
        val out = exec.execute("n", null, input)
        assertTrue(out.isArray)
        assertEquals(3, out.size())
    }

    @Test
    fun `cron executor returns NullNode when runInput missing`() {
        val out = TriggerCronExecutor().execute("n", null, mapper.createObjectNode())
        assertTrue(out.isNull)
    }

    @Test
    fun `interval executor identifies as interval`() {
        val exec = TriggerIntervalExecutor()
        assertEquals("trigger.interval", exec.type)
        val out = exec.execute("n", null, mapper.readTree("""{"runInput":"hi"}"""))
        assertEquals("hi", out.asText())
    }

    @Test
    fun `interval executor returns NullNode when runInput missing`() {
        val out = TriggerIntervalExecutor().execute("n", null, mapper.createObjectNode())
        assertTrue(out.isNull)
    }

    @Test
    fun `manual executor identifies as manual`() {
        val exec = TriggerManualExecutor()
        assertEquals("trigger.manual", exec.type)
        val out = exec.execute("n", null, mapper.readTree("""{"runInput":42}"""))
        assertEquals(42, out.asInt())
    }

    @Test
    fun `manual executor returns NullNode when runInput missing`() {
        val out = TriggerManualExecutor().execute("n", null, mapper.createObjectNode())
        assertTrue(out.isNull)
    }
}
