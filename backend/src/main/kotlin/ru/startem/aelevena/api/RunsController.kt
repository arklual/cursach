package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.NodeRun
import ru.startem.aelevena.api.dto.WorkflowRun
import ru.startem.aelevena.api.dto.WorkflowRunResult
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.run.RunQueryService
import java.util.UUID

@RestController
@Tag(name = "Runs", description = "Запуск workflow и просмотр истории/деталей запусков")
class RunsController(
    private val runEnqueueService: RunEnqueueService,
    private val runQueryService: RunQueryService,
) {
    @Operation(
        summary = "Запустить workflow",
        description = "Ставит новый запуск указанного workflow в очередь на выполнение. " +
            "Опционально принимает входной payload (JSON) и идентификатор стартового узла (startNodeId). " +
            "Возвращает HTTP 202 Accepted с информацией о созданном запуске. " +
            "Может вернуть ошибку, если workflow с указанным идентификатором не найден.",
    )
    @PostMapping("/workflows/{workflowId}/runs")
    fun runWorkflow(
        @PathVariable workflowId: UUID,
        @RequestParam(required = false) startNodeId: String?,
        @RequestBody(required = false) @Valid payload: JsonNode?,
    ): ResponseEntity<WorkflowRun> {
        val runId = runEnqueueService.enqueue(workflowId, payload, startNodeId = startNodeId)
        return ResponseEntity.accepted().body(runQueryService.getWorkflowRun(runId))
    }

    @Operation(
        summary = "Список запусков workflow",
        description = "Возвращает список всех запусков указанного workflow в виде массива объектов WorkflowRun. " +
            "Если у workflow ещё не было запусков, возвращается пустой список.",
    )
    @GetMapping("/workflows/{workflowId}/runs")
    fun listRuns(@PathVariable workflowId: UUID): List<WorkflowRun> =
        runQueryService.listWorkflowRuns(workflowId)

    @Operation(
        summary = "Получить запуск по идентификатору",
        description = "Возвращает детали конкретного запуска workflow по его идентификатору (runId), " +
            "включая текущий статус и метаданные. " +
            "Может вернуть ошибку, если запуск с указанным идентификатором не найден.",
    )
    @GetMapping("/workflow-runs/{runId}")
    fun getRun(@PathVariable runId: Long): WorkflowRun =
        runQueryService.getWorkflowRun(runId)

    @Operation(
        summary = "Получить результат запуска",
        description = "Возвращает итоговый результат выполнения запуска workflow по его идентификатору (runId) " +
            "в виде объекта WorkflowRunResult. " +
            "Может вернуть ошибку, если запуск не найден или результат ещё не сформирован.",
    )
    @GetMapping("/workflow-runs/{runId}/result")
    fun getRunResult(@PathVariable runId: Long): WorkflowRunResult =
        runQueryService.getWorkflowRunResult(runId)

    @Operation(
        summary = "Получить запуск узла",
        description = "Возвращает детали выполнения отдельного узла (node run) по его идентификатору (nodeRunId) " +
            "в виде объекта NodeRun, включая статус, входные и выходные данные узла. " +
            "Может вернуть ошибку, если запуск узла с указанным идентификатором не найден.",
    )
    @GetMapping("/node-runs/{nodeRunId}")
    fun getNodeRun(@PathVariable nodeRunId: Long): NodeRun =
        runQueryService.getNodeRun(nodeRunId)
}

