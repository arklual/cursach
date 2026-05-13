package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import jakarta.validation.constraints.NotBlank

data class TriggerCreateRequest(
    @field:NotBlank
    val type: String,
    val config: JsonNode? = null,
)

data class Trigger(
    val id: String,
    val workflowId: String,
    val type: String,
    val config: JsonNode? = null,
)

