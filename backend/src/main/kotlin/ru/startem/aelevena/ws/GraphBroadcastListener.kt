package ru.startem.aelevena.ws

import org.springframework.context.event.EventListener
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Component
import ru.startem.aelevena.workflow.GraphUpdatedEvent

/**
 * Подписывается на GraphUpdatedEvent (его публикует WorkflowService при любом updateGraph —
 * как из REST PUT /workflow-versions/{id}/graph, так и из STOMP @MessageMapping) и
 * шлёт свежий граф в /topic/workflows/{workflowId}/graph.
 *
 * Так фронт получает live-обновления независимо от того, чем была инициирована правка.
 */
@Component
class GraphBroadcastListener(
    private val messaging: SimpMessagingTemplate,
) {
    @EventListener
    fun onGraphUpdated(event: GraphUpdatedEvent) {
        messaging.convertAndSend("/topic/workflows/${event.workflowId}/graph", event.graph)
    }
}
