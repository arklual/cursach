package ru.startem.aelevena.ws

import org.springframework.messaging.handler.annotation.DestinationVariable
import org.springframework.messaging.handler.annotation.MessageExceptionHandler
import org.springframework.messaging.handler.annotation.MessageMapping
import org.springframework.messaging.handler.annotation.Payload
import org.springframework.messaging.simp.annotation.SendToUser
import org.springframework.stereotype.Controller
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import java.util.UUID

@Controller
class WorkflowWsController(
    private val workflowService: WorkflowService,
) {
    data class WsError(val message: String)

    /**
     * STOMP-вход для совместного редактирования. После updateGraph WorkflowService
     * публикует GraphUpdatedEvent, который GraphBroadcastListener рассылает в /topic/...
     */
    @MessageMapping("/workflows/{workflowId}/graph")
    fun updateGraph(
        @DestinationVariable workflowId: UUID,
        @Payload graph: WorkflowGraph,
    ) {
        val versionId = graph.versionId.toLongOrNull()
            ?: throw IllegalArgumentException("graph.versionId must be a number")
        workflowService.updateGraph(versionId, graph.copy(versionId = versionId.toString()))
    }

    @MessageExceptionHandler
    @SendToUser("/queue/errors")
    fun handleError(ex: Exception): WsError = WsError(ex.message ?: "Unknown error")
}

