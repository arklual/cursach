package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode

/**
 * DTO для исполнения workflow - аналог n8n execution data
 */

data class ExecutionStatus(
    val status: String, // pending, running, success, error, waiting
    val workflowId: String,
    val executionId: String,
    val startedAt: String? = null,
    val stoppedAt: String? = null,
    val duration: Long? = null,
    val nodes: List<NodeExecutionStatus> = emptyList(),
)

data class NodeExecutionStatus(
    val nodeId: String,
    val nodeName: String,
    val nodeType: String,
    val status: String, // pending, running, success, error, skipped
    val startTime: String? = null,
    val endTime: String? = null,
    val duration: Long? = null,
    val inputData: List<ExecutionData>? = null,
    val outputData: List<ExecutionData>? = null,
    val error: ExecutionError? = null,
    val itemsCount: Int? = null,
)

data class ExecutionData(
    val json: JsonNode,
    val binary: JsonNode? = null,
)

data class ExecutionError(
    val message: String,
    val details: String? = null,
    val stack: String? = null,
)

data class ExecuteWorkflowRequest(
    val workflowId: String,
    val fromNodeId: String? = null, // опционально: запуск с конкретной ноды
    val inputData: Map<String, JsonNode>? = null, // входные данные для workflow
)

data class ExecutionProgress(
    val workflowId: String,
    val executionId: String,
    val status: String,
    val currentNodeId: String? = null,
    val completedNodes: List<String> = emptyList(),
    val totalNodes: Int,
    val progress: Int, // 0-100
)
