package ru.startem.aelevena.ws

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Component
import java.time.Instant
import java.util.UUID

/**
 * Трансляция событий жизненного цикла исполнения workflow клиентским подписчикам по WebSocket
 * (STOMP поверх SockJS). Все события уходят в топик `/topic/workflows/{workflowId}/graph`
 * (ТЗ 4.1.1, требование 10).
 *
 * Сообщения снабжены полем `event` — по нему клиент отличает события исполнения от
 * сообщений синхронизации графа (которые поля `event` не имеют, см. [GraphBroadcastListener]).
 *
 * Отправка не должна влиять на исполнение workflow: любые сбои транспорта логируются и глотаются.
 */
@Component
class RunEventBroadcaster(
    private val messaging: SimpMessagingTemplate,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun workflowStarted(workflowId: UUID, runId: Long) =
        send(workflowId, "workflow_started", runId, nodeId = null, status = "running")

    fun nodeReached(workflowId: UUID, runId: Long, nodeId: String) =
        send(workflowId, "node_reached", runId, nodeId, status = "running")

    fun nodeAction(workflowId: UUID, runId: Long, nodeId: String) =
        send(workflowId, "node_action", runId, nodeId, status = "running")

    fun nodeExited(workflowId: UUID, runId: Long, nodeId: String, status: String) =
        send(workflowId, "node_exited", runId, nodeId, status)

    fun workflowFinished(workflowId: UUID, runId: Long, status: String) =
        send(workflowId, "workflow_finished", runId, nodeId = null, status = status)

    private fun send(workflowId: UUID, event: String, runId: Long, nodeId: String?, status: String) {
        try {
            val payload = objectMapper.createObjectNode().apply {
                put("event", event)
                put("workflowId", workflowId.toString())
                put("runId", runId)
                if (nodeId != null) {
                    put("nodeId", nodeId)
                }
                put("status", status)
                put("ts", Instant.now().toString())
            }
            messaging.convertAndSend("/topic/workflows/$workflowId/graph", payload)
        } catch (ex: Exception) {
            log.debug("Failed to broadcast {} for run {}: {}", event, runId, ex.message)
        }
    }
}
