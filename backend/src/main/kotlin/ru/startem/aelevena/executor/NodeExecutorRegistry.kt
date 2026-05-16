package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class NodeExecutorRegistry(
    executors: List<NodeExecutor>,
    private val objectMapper: ObjectMapper,
) {
    private val byType: Map<String, NodeExecutor> = executors.associateBy { it.type }

    fun get(type: String): NodeExecutor? = byType[type]
    
    fun getExecutor(type: String): NodeExecutor = byType[type] 
        ?: throw IllegalArgumentException("No executor found for node type: $type")
    
    fun getObjectMapper(): ObjectMapper = objectMapper
}

