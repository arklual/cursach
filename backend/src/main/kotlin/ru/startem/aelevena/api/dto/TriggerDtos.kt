package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode

data class Trigger(
    val id: String,
    val workflowId: String,
    val nodeId: String,
    val type: String,
    val config: JsonNode? = null,
    val token: String? = null,
)
