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
