package ru.startem.aelevena.executor

import org.springframework.stereotype.Component

@Component
class NodeExecutorRegistry(
    executors: List<NodeExecutor>,
) {
    private val byType: Map<String, NodeExecutor> = executors.associateBy { it.type }

    fun get(type: String): NodeExecutor? = byType[type]
}

