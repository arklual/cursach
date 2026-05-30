package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "Триггер запуска рабочего процесса")
data class Trigger(
    @get:Schema(description = "Идентификатор триггера", example = "trg-123")
    val id: String,
    @get:Schema(description = "Идентификатор рабочего процесса, к которому относится триггер", example = "wf-123")
    val workflowId: String,
    @get:Schema(description = "Идентификатор узла рабочего процесса, связанного с триггером", example = "node-123")
    val nodeId: String,
    @get:Schema(description = "Тип триггера", example = "webhook")
    val type: String,
    @get:Schema(description = "Конфигурация триггера в формате JSON")
    val config: JsonNode? = null,
    @get:Schema(description = "Токен для аутентификации входящих вызовов триггера")
    val token: String? = null,
    @get:Schema(description = "Признак того, что триггер включён", example = "true")
    val enabled: Boolean = true,
)

@Schema(description = "Данные для обновления состояния триггера")
data class TriggerUpdate(
    @get:Schema(description = "Признак того, что триггер должен быть включён", example = "true")
    val enabled: Boolean,
)
