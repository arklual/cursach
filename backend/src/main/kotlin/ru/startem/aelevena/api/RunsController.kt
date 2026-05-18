package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.JsonNode
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
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.run.RunQueryService
import java.util.UUID

@RestController
class RunsController(
    private val runEnqueueService: RunEnqueueService,
    private val runQueryService: RunQueryService,
) {
    @PostMapping("/workflows/{workflowId}/runs")
    fun runWorkflow(
        @PathVariable workflowId: UUID,
        @RequestParam(required = false) startNodeId: String?,
        @RequestBody(required = false) @Valid payload: JsonNode?,
    ): ResponseEntity<WorkflowRun> {
        val runId = runEnqueueService.enqueue(workflowId, payload, startNodeId = startNodeId)
        return ResponseEntity.accepted().body(runQueryService.getWorkflowRun(runId))
    }

    @GetMapping("/workflows/{workflowId}/runs")
    fun listRuns(@PathVariable workflowId: UUID): List<WorkflowRun> =
        runQueryService.listWorkflowRuns(workflowId)

    @GetMapping("/workflow-runs/{runId}")
    fun getRun(@PathVariable runId: Long): WorkflowRun =
        runQueryService.getWorkflowRun(runId)

    @GetMapping("/node-runs/{nodeRunId}")
    fun getNodeRun(@PathVariable nodeRunId: Long): NodeRun =
        runQueryService.getNodeRun(nodeRunId)
}

