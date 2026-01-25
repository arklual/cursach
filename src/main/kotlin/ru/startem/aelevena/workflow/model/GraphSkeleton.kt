package ru.startem.aelevena.workflow.model

import com.fasterxml.jackson.databind.JsonNode

data class GraphSkeleton(
    val nodes: List<NodeSkeleton>,
    val connections: List<ConnectionSkeleton>,
)

data class NodeSkeleton(
    val id: String,
    val type: String,
    val position: PositionSkeleton? = null,
    val data: NodeDataSkeleton? = null,
)

data class PositionSkeleton(
    val x: Double,
    val y: Double,
)

data class NodeDataSkeleton(
    val label: String? = null,
    val configHash: String? = null,
    val abConfig: JsonNode? = null,
)

data class ConnectionSkeleton(
    val id: String,
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
)

