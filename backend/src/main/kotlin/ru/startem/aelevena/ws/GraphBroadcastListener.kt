package ru.startem.aelevena.ws

import org.springframework.context.event.EventListener
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Component
import ru.startem.aelevena.workflow.GraphUpdatedEvent

@Component
class GraphBroadcastListener(
    private val messaging: SimpMessagingTemplate,
) {
    @EventListener
    fun onGraphUpdated(event: GraphUpdatedEvent) {
        messaging.convertAndSend("/topic/workflows/${event.workflowId}/graph", event.graph)
    }
}
