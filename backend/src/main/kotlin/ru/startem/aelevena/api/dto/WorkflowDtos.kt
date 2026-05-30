package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank

@Schema(description = "Запрос на создание нового рабочего процесса (workflow)")
data class WorkflowCreateRequest(
    @field:NotBlank
    @get:Schema(description = "Название рабочего процесса", example = "Мой рабочий процесс")
    val name: String,
    @get:Schema(description = "Описание рабочего процесса")
    val description: String? = null,
)

@Schema(description = "Рабочий процесс (workflow) вместе с его графом")
data class Workflow(
    @get:Schema(description = "Метаданные рабочего процесса")
    val meta: WorkflowMeta,
    @get:Schema(description = "Граф рабочего процесса (узлы и связи)")
    val graph: WorkflowGraph,
)

@Schema(description = "Метаданные рабочего процесса")
data class WorkflowMeta(
    @get:Schema(description = "Идентификатор рабочего процесса", example = "wf-123")
    val id: String,
    @get:Schema(description = "Название рабочего процесса", example = "Мой рабочий процесс")
    val name: String,
    @get:Schema(description = "Описание рабочего процесса")
    val description: String? = null,
    @get:Schema(description = "Признак демонстрационного рабочего процесса", example = "false")
    val isDemo: Boolean = false,
    @get:Schema(description = "Количество узлов в рабочем процессе", example = "0")
    val nodesCount: Int = 0,
    @get:Schema(description = "Дата и время создания рабочего процесса")
    val createdAt: String,
    @get:Schema(description = "Дата и время последнего обновления рабочего процесса")
    val updatedAt: String,
)

@Schema(description = "Запрос на обновление метаданных рабочего процесса")
data class WorkflowMetaUpdate(
    @get:Schema(description = "Новое название рабочего процесса")
    val name: String? = null,
    @get:Schema(description = "Новое описание рабочего процесса")
    val description: String? = null,
)

@Schema(description = "Версия рабочего процесса")
data class WorkflowVersion(
    @get:Schema(description = "Идентификатор версии", example = "ver-123")
    val id: String,
    @get:Schema(description = "Идентификатор рабочего процесса, к которому относится версия", example = "wf-123")
    val workflowId: String,
    @get:Schema(description = "Тег версии", example = "v1.0")
    val tag: String? = null,
    @get:Schema(description = "Дата и время создания версии")
    val createdAt: String,
)

@Schema(description = "Запрос на создание новой версии рабочего процесса")
data class WorkflowVersionCreateRequest(
    @get:Schema(description = "Тег создаваемой версии", example = "v1.0")
    val versionTag: String? = null,
)

@Schema(description = "Граф рабочего процесса: узлы и связи между ними")
data class WorkflowGraph(
    @get:Schema(description = "Идентификатор версии, к которой относится граф", example = "ver-123")
    val versionId: String,
    @get:Schema(description = "Список узлов графа")
    val nodes: List<Node>,
    @get:Schema(description = "Список связей между узлами графа")
    val connections: List<Connection>,
)

@Schema(description = "Узел графа рабочего процесса")
data class Node(
    @get:Schema(description = "Идентификатор узла", example = "node-123")
    val id: String,
    @get:Schema(description = "Тип узла", example = "trigger")
    val type: String,
    @get:Schema(description = "Позиция узла на холсте")
    val position: Position? = null,
    @get:Schema(description = "Данные (конфигурация) узла")
    val data: NodeData? = null,
)

@Schema(description = "Позиция узла на холсте")
data class Position(
    @get:Schema(description = "Координата X", example = "100.0")
    val x: Double,
    @get:Schema(description = "Координата Y", example = "200.0")
    val y: Double,
)

@Schema(description = "Данные узла графа: подпись и конфигурация")
data class NodeData(
    @get:Schema(description = "Подпись (название) узла")
    val label: String? = null,
    @get:Schema(description = "Конфигурация узла в формате JSON")
    val config: JsonNode? = null,
    @get:Schema(description = "Конфигурация A/B-теста узла в формате JSON")
    val abConfig: JsonNode? = null,
)

@Schema(description = "Связь (ребро) между узлами графа рабочего процесса")
data class Connection(
    @get:Schema(description = "Идентификатор связи", example = "conn-123")
    val id: String,
    @get:Schema(description = "Идентификатор узла-источника", example = "node-1")
    val source: String,
    @get:Schema(description = "Идентификатор узла-приёмника", example = "node-2")
    val target: String,
    @get:Schema(description = "Идентификатор выходного порта (handle) узла-источника")
    val sourceHandle: String? = null,
    @get:Schema(description = "Идентификатор входного порта (handle) узла-приёмника")
    val targetHandle: String? = null,
    @get:Schema(description = "Вариант (тип) связи")
    val variant: String? = null,
)

@Schema(description = "Снимок (snapshot) рабочего процесса")
data class WorkflowSnapshot(
    @get:Schema(description = "Идентификатор снимка", example = "snap-123")
    val id: String,
    @get:Schema(description = "Идентификатор рабочего процесса, для которого создан снимок", example = "wf-123")
    val workflowId: String,
    @get:Schema(description = "Название снимка", example = "Снимок перед релизом")
    val name: String,
    @get:Schema(description = "Описание снимка")
    val description: String? = null,
    @get:Schema(description = "Дата и время создания снимка")
    val createdAt: String,
)

@Schema(description = "Запрос на создание снимка рабочего процесса")
data class CreateSnapshotRequest(
    @field:NotBlank
    @get:Schema(description = "Название снимка", example = "Снимок перед релизом")
    val name: String,
    @get:Schema(description = "Описание снимка")
    val description: String? = null,
)

@Schema(description = "Запрос на обновление имени и описания снимка рабочего процесса")
data class UpdateSnapshotRequest(
    @field:NotBlank
    @get:Schema(description = "Новое название снимка", example = "Снимок перед релизом v2")
    val name: String,
    @get:Schema(description = "Новое описание снимка")
    val description: String? = null,
)
