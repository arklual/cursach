package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import java.time.Instant

data class DebugSessionDto(
    val sessionId: String,
    val workflowId: String,
    val versionId: String,
    val status: String,
    val input: JsonNode?,
    /** Variables visible to the user at this point — keyed by upstream nodeId. */
    val outputs: Map<String, JsonNode>,
    val completed: List<String>,
    val skipped: List<String>,
    val failed: List<DebugFailedNode>,
    /** Next nodes that can be stepped. Empty when run is done. */
    val ready: List<String>,
    val createdAt: Instant,
    val updatedAt: Instant,
    /**
     * Inputs we would feed each ready node if stepped now — gives the UI a preview
     * so a user can see what will be passed in before pressing Step.
     */
    val readyInputs: Map<String, JsonNode> = emptyMap(),
)

data class DebugFailedNode(
    val nodeId: String,
    val message: String,
)

data class DebugStartRequest(
    val input: JsonNode? = null,
    val startNodeId: String? = null,
)

data class DebugStepRequest(
    /** If null — execute the first ready node. Otherwise execute the named one (must be in `ready`). */
    val nodeId: String? = null,
)

/** Запрос пошаговой отладки одной ноды: произвольное входное значение без прогона графа. */
data class DebugNodeRunRequest(
    val input: JsonNode? = null,
)

/**
 * Синхронный результат отладочного запуска одной ноды. Сам запуск также фиксируется
 * в истории (`workflow_run.is_debug = true`) с единственной записью `node_run`.
 */
data class DebugNodeRunResult(
    val runId: String,
    val workflowId: String,
    val nodeId: String,
    val status: String,
    val input: JsonNode? = null,
    val output: JsonNode? = null,
    val errorMessage: String? = null,
)
