package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.NullNode
import org.springframework.stereotype.Component

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
