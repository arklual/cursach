package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import jakarta.validation.constraints.NotBlank

data class WorkflowCreateRequest(
    @field:NotBlank
    val name: String,
    val description: String? = null,
)

data class Workflow(
    val meta: WorkflowMeta,
    val graph: WorkflowGraph,
)

data class WorkflowMeta(
    val id: String,
    val name: String,
    val description: String? = null,
    val isDemo: Boolean = false,
    val nodesCount: Int = 0,
    val createdAt: String,
    val updatedAt: String,
)

data class WorkflowMetaUpdate(
    val name: String? = null,
    val description: String? = null,
)

data class WorkflowVersion(
    val id: String,
    val workflowId: String,
    val tag: String? = null,
    val createdAt: String,
)

data class WorkflowGraph(
    val versionId: String,
    val nodes: List<Node>,
    val connections: List<Connection>,
)

data class Node(
    val id: String,
    val type: String,
    val position: Position? = null,
    val data: NodeData? = null,
)

data class Position(
    val x: Double,
    val y: Double,
)

data class NodeData(
    val label: String? = null,
    val config: JsonNode? = null,
    val abConfig: JsonNode? = null,
)

data class Connection(
    val id: String,
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
)

