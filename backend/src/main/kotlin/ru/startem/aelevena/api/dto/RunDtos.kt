package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "Запуск (выполнение) рабочего процесса со списком запусков узлов")
data class WorkflowRun(
    @get:Schema(description = "Идентификатор запуска рабочего процесса", example = "run-123")
    val id: String,
    @get:Schema(description = "Идентификатор рабочего процесса, к которому относится запуск", example = "wf-123")
    val workflowId: String,
    @get:Schema(description = "Статус запуска", example = "RUNNING")
    val status: String,
    @get:Schema(description = "Время начала запуска в формате ISO-8601")
    val startedAt: String? = null,
    @get:Schema(description = "Время завершения запуска в формате ISO-8601")
    val finishedAt: String? = null,
    @get:Schema(description = "Длительность запуска в миллисекундах")
    val durationMs: Long? = null,
    @get:Schema(description = "Входные данные запуска")
    val input: JsonNode? = null,
    @get:Schema(description = "Выходные данные запуска")
    val output: JsonNode? = null,
    @get:Schema(description = "Идентификатор узла, с которого начинается выполнение")
    val startNodeId: String? = null,
    @get:Schema(description = "Признак отладочного запуска", example = "false")
    val isDebug: Boolean = false,
    @get:Schema(description = "Тип триггера, инициировавшего запуск", example = "WEBHOOK")
    val triggerType: String? = null,
    @get:Schema(description = "Список запусков узлов в рамках данного запуска рабочего процесса")
    val nodes: List<NodeRun> = emptyList(),
)

@Schema(description = "Запуск (выполнение) отдельного узла рабочего процесса")
data class NodeRun(
    @get:Schema(description = "Идентификатор запуска узла", example = "noderun-123")
    val id: String,
    @get:Schema(description = "Идентификатор запуска рабочего процесса, к которому относится запуск узла", example = "run-123")
    val workflowRunId: String,
    @get:Schema(description = "Идентификатор узла в рабочем процессе", example = "node-123")
    val nodeId: String,
    @get:Schema(description = "Статус запуска узла", example = "SUCCESS")
    val status: String,
    @get:Schema(description = "Тип узла", example = "http")
    val nodeType: String? = null,
    @get:Schema(description = "Время начала запуска узла в формате ISO-8601")
    val startedAt: String? = null,
    @get:Schema(description = "Время завершения запуска узла в формате ISO-8601")
    val finishedAt: String? = null,
    @get:Schema(description = "Входные данные узла")
    val input: JsonNode? = null,
    @get:Schema(description = "Выходные данные узла")
    val output: JsonNode? = null,
    @get:Schema(description = "Сообщение об ошибке, если запуск узла завершился неудачно")
    val errorMessage: String? = null,
)

@Schema(description = "Результат приёма входящего вебхука с информацией о запуске и ссылкой для опроса статуса")
data class WebhookAccepted(
    @get:Schema(description = "Информация о запущенном рабочем процессе")
    val run: WorkflowRun,
    @get:Schema(description = "URL для опроса статуса запуска")
    val pollUrl: String,
)

@Schema(description = "Краткий результат запуска рабочего процесса")
data class WorkflowRunResult(
    @get:Schema(description = "Идентификатор запуска рабочего процесса", example = "run-123")
    val id: String,
    @get:Schema(description = "Идентификатор рабочего процесса, к которому относится запуск", example = "wf-123")
    val workflowId: String,
    @get:Schema(description = "Статус запуска", example = "SUCCESS")
    val status: String,
    @get:Schema(description = "Время начала запуска в формате ISO-8601")
    val startedAt: String? = null,
    @get:Schema(description = "Время завершения запуска в формате ISO-8601")
    val finishedAt: String? = null,
    @get:Schema(description = "Длительность запуска в миллисекундах")
    val durationMs: Long? = null,
    @get:Schema(description = "Выходные данные запуска")
    val output: JsonNode? = null,
)
