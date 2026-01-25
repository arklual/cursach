package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode

data class WorkflowRun(
    val id: String,
    val workflowId: String,
    val status: String,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val input: JsonNode? = null,
    val output: JsonNode? = null,
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

