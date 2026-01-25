package ru.startem.aelevena.ws

import org.springframework.messaging.handler.annotation.DestinationVariable
import org.springframework.messaging.handler.annotation.MessageExceptionHandler
import org.springframework.messaging.handler.annotation.MessageMapping
import org.springframework.messaging.handler.annotation.Payload
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.messaging.simp.annotation.SendToUser
import org.springframework.stereotype.Controller
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import java.util.UUID

@Controller
class WorkflowWsController(
    private val workflowService: WorkflowService,
    private val messaging: SimpMessagingTemplate,
) {
    data class WsError(val message: String)

    @MessageMapping("/workflows/{workflowId}/graph")
    fun updateGraph(
        @DestinationVariable workflowId: UUID,
        @Payload graph: WorkflowGraph,
    ) {
        val versionId = graph.versionId.toLongOrNull()
            ?: throw IllegalArgumentException("graph.versionId must be a number")

        val updated = workflowService.updateGraph(versionId, graph.copy(versionId = versionId.toString()))
        messaging.convertAndSend("/topic/workflows/$workflowId/graph", updated)
    }

    @MessageExceptionHandler
    @SendToUser("/queue/errors")
    fun handleError(ex: Exception): WsError = WsError(ex.message ?: "Unknown error")
}

