package ru.startem.aelevena.ws

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.any
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.springframework.messaging.simp.SimpMessagingTemplate
import java.util.UUID

class RunEventBroadcasterTest {

    private val messaging = mock(SimpMessagingTemplate::class.java)
    private val broadcaster = RunEventBroadcaster(messaging, ObjectMapper())
    private val workflowId = UUID.fromString("11111111-1111-1111-1111-111111111111")

    @Test
    fun `workflowStarted publishes event to graph topic with discriminator`() {
        broadcaster.workflowStarted(workflowId, 42L)

        val captor = ArgumentCaptor.forClass(Any::class.java)
        verify(messaging).convertAndSend(eq("/topic/workflows/$workflowId/graph"), captor.capture())
        val payload = captor.value as JsonNode
        assertEquals("workflow_started", payload.get("event").asText())
        assertEquals(workflowId.toString(), payload.get("workflowId").asText())
        assertEquals(42L, payload.get("runId").asLong())
        assertEquals("running", payload.get("status").asText())
        assertTrue(payload.has("ts"))
    }

    @Test
    fun `node events carry nodeId and status`() {
        broadcaster.nodeReached(workflowId, 1L, "node-a")
        broadcaster.nodeAction(workflowId, 1L, "node-a")
        broadcaster.nodeExited(workflowId, 1L, "node-a", "success")

        val captor = ArgumentCaptor.forClass(Any::class.java)
        verify(messaging, times(3)).convertAndSend(any<String>(), captor.capture())
        val events = captor.allValues.map { (it as JsonNode).get("event").asText() }
        assertEquals(listOf("node_reached", "node_action", "node_exited"), events)
        captor.allValues.forEach { assertEquals("node-a", (it as JsonNode).get("nodeId").asText()) }
        assertEquals("success", (captor.allValues.last() as JsonNode).get("status").asText())
    }

    @Test
    fun `workflowFinished carries terminal status`() {
        broadcaster.workflowFinished(workflowId, 7L, "failed")

        val captor = ArgumentCaptor.forClass(Any::class.java)
        verify(messaging).convertAndSend(any<String>(), captor.capture())
        val payload = captor.value as JsonNode
        assertEquals("workflow_finished", payload.get("event").asText())
        assertEquals("failed", payload.get("status").asText())
    }

    @Test
    fun `transport failure is swallowed and never propagates to caller`() {
        doThrow(RuntimeException("broker down")).`when`(messaging).convertAndSend(any<String>(), any<Any>())
        broadcaster.workflowStarted(workflowId, 99L)
    }
}
