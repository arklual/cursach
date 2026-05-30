package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode

data class WorkflowRun(
    val id: String,
    val workflowId: String,
    val status: String,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val durationMs: Long? = null,
    val input: JsonNode? = null,
    val output: JsonNode? = null,
    val startNodeId: String? = null,
    val isDebug: Boolean = false,
    val nodes: List<NodeRun> = emptyList(),
)

data class NodeRun(
    val id: String,
    val workflowRunId: String,
    val nodeId: String,
    val status: String,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val input: JsonNode? = null,
    val output: JsonNode? = null,
    val errorMessage: String? = null,
)

data class WebhookAccepted(
    val run: WorkflowRun,
    val pollUrl: String,
)

data class WorkflowRunResult(
    val id: String,
    val workflowId: String,
    val status: String,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val durationMs: Long? = null,
    val output: JsonNode? = null,
)

