package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

@Schema(description = "Состояние сессии пошаговой отладки рабочего процесса")
data class DebugSessionDto(
    @get:Schema(description = "Идентификатор сессии отладки", example = "a1b2c3d4-0000-0000-0000-000000000000")
    val sessionId: String,
    @get:Schema(description = "Идентификатор рабочего процесса (workflow)", example = "wf-12345")
    val workflowId: String,
    @get:Schema(description = "Идентификатор версии рабочего процесса", example = "v-12345")
    val versionId: String,
    @get:Schema(description = "Текущий статус сессии отладки", example = "RUNNING")
    val status: String,
    @get:Schema(description = "Входные данные, переданные в начале отладочного прогона")
    val input: JsonNode?,
    @get:Schema(description = "Выходные значения, доступные пользователю на текущем шаге; ключ — идентификатор узла-источника")
    val outputs: Map<String, JsonNode>,
    @get:Schema(description = "Список идентификаторов успешно выполненных узлов")
    val completed: List<String>,
    @get:Schema(description = "Список идентификаторов пропущенных узлов")
    val skipped: List<String>,
    @get:Schema(description = "Список узлов, завершившихся с ошибкой")
    val failed: List<DebugFailedNode>,
    @get:Schema(description = "Идентификаторы узлов, готовых к выполнению на следующем шаге; пусто, когда прогон завершён")
    val ready: List<String>,
    @get:Schema(description = "Дата и время создания сессии отладки")
    val createdAt: Instant,
    @get:Schema(description = "Дата и время последнего обновления сессии отладки")
    val updatedAt: Instant,
    @get:Schema(description = "Предпросмотр входных данных для каждого готового узла; ключ — идентификатор узла")
    val readyInputs: Map<String, JsonNode> = emptyMap(),
)

@Schema(description = "Информация об узле, завершившемся с ошибкой во время отладки")
data class DebugFailedNode(
    @get:Schema(description = "Идентификатор узла, завершившегося с ошибкой", example = "node-12345")
    val nodeId: String,
    @get:Schema(description = "Текст сообщения об ошибке")
    val message: String,
)

@Schema(description = "Запрос на запуск сессии пошаговой отладки рабочего процесса")
data class DebugStartRequest(
    @get:Schema(description = "Входные данные для отладочного прогона")
    val input: JsonNode? = null,
    @get:Schema(description = "Идентификатор стартового узла, с которого начинается отладка", example = "node-12345")
    val startNodeId: String? = null,
)

@Schema(description = "Запрос на выполнение одного шага отладки")
data class DebugStepRequest(
    @get:Schema(description = "Идентификатор узла для выполнения; если null — выполняется первый готовый узел", example = "node-12345")
    val nodeId: String? = null,
)

@Schema(description = "Запрос пошаговой отладки одной ноды: произвольное входное значение без прогона графа")
data class DebugNodeRunRequest(
    @get:Schema(description = "Входные данные для отладочного запуска одной ноды")
    val input: JsonNode? = null,
)

@Schema(description = "Синхронный результат отладочного запуска одной ноды")
data class DebugNodeRunResult(
    @get:Schema(description = "Идентификатор отладочного прогона", example = "run-12345")
    val runId: String,
    @get:Schema(description = "Идентификатор рабочего процесса (workflow)", example = "wf-12345")
    val workflowId: String,
    @get:Schema(description = "Идентификатор отлаживаемого узла", example = "node-12345")
    val nodeId: String,
    @get:Schema(description = "Статус выполнения узла", example = "SUCCESS")
    val status: String,
    @get:Schema(description = "Входные данные, переданные в узел")
    val input: JsonNode? = null,
    @get:Schema(description = "Выходные данные, полученные от узла")
    val output: JsonNode? = null,
    @get:Schema(description = "Сообщение об ошибке, если выполнение не удалось")
    val errorMessage: String? = null,
)
