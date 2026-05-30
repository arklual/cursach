package ru.startem.aelevena.ws

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import java.util.UUID

class WorkflowWsControllerTest {

    private val workflowService: WorkflowService = mock(WorkflowService::class.java)
    private val controller = WorkflowWsController(workflowService)

    @Test
    fun `updateGraph delegates to workflowService with parsed versionId`() {
        val workflowId = UUID.randomUUID()
        val versionId = 42L
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = emptyList(),
            connections = emptyList(),
        )

        controller.updateGraph(workflowId, graph)

        verify(workflowService).updateGraph(versionId, graph)
    }

    @Test
    fun `updateGraph rejects non-numeric versionId`() {
        val workflowId = UUID.randomUUID()
        val graph = WorkflowGraph(
            versionId = "not-a-number",
            nodes = emptyList(),
            connections = emptyList(),
        )

        assertThrows(IllegalArgumentException::class.java) {
            controller.updateGraph(workflowId, graph)
        }
    }

    @Test
    fun `handleError surfaces IllegalArgumentException message verbatim`() {
        val err = controller.handleError(IllegalArgumentException("bad payload"))
        assertEquals("bad payload", err.message)
    }

    @Test
    fun `handleError surfaces NotFoundException message verbatim`() {
        val err = controller.handleError(NotFoundException("missing"))
        assertEquals("missing", err.message)
    }

    @Test
    fun `handleError falls back to default when IllegalArgumentException has null message`() {
        val err = controller.handleError(IllegalArgumentException(null as String?))
        assertEquals("Invalid request", err.message)
    }

    @Test
    fun `handleError redacts unknown exception type`() {
        val err = controller.handleError(RuntimeException("internal secret"))
        assertEquals("Internal error", err.message)
    }

    @Test
    fun `WsError data class equals and copy`() {
        val a = WorkflowWsController.WsError("x")
        val b = a.copy()
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }
}
