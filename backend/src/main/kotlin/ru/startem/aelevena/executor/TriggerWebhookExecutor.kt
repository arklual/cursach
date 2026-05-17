package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.NullNode
import org.springframework.stereotype.Component

/**
 * Passthrough executor for trigger nodes. The trigger fires the workflow (webhook hit /
 * cron tick / interval tick) — when execution reaches the node itself, we just forward
 * the run input as the node's output so downstream nodes can read it via inputs.{nodeId}.
 */
private fun passthrough(input: JsonNode): JsonNode =
    input.get("runInput") ?: NullNode.instance

@Component
class TriggerWebhookExecutor : NodeExecutor {
    override val type: String = "trigger.webhook"
    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode = passthrough(input)
}

@Component
class TriggerCronExecutor : NodeExecutor {
    override val type: String = "trigger.cron"
    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode = passthrough(input)
}

@Component
class TriggerIntervalExecutor : NodeExecutor {
    override val type: String = "trigger.interval"
    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode = passthrough(input)
}

@Component
class TriggerManualExecutor : NodeExecutor {
    override val type: String = "trigger.manual"
    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode = passthrough(input)
}
