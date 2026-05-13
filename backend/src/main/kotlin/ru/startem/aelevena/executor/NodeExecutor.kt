package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode

interface NodeExecutor {
    val type: String
    fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode
}

