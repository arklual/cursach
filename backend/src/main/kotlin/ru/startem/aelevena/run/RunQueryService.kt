package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.NodeRun
import ru.startem.aelevena.api.dto.WorkflowRun
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.time.Duration
import java.util.UUID

@Service
@Transactional(readOnly = true)
class RunQueryService(
    private val workflows: WorkflowsRepository,
    private val workflowRuns: WorkflowRunRepository,
    private val nodeRuns: NodeRunRepository,
    private val objectMapper: ObjectMapper,
) {
    fun getWorkflowRun(runId: Long): WorkflowRun {
        val row = workflowRuns.findById(runId) ?: throw NotFoundException("Run not found")
        val nodes = nodeRuns.listByWorkflowRun(runId).map { it.toDto() }
        return row.toDto(nodes)
    }

    fun listWorkflowRuns(workflowId: UUID): List<WorkflowRun> {
        workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val runs = workflowRuns.listByWorkflow(workflowId)
        if (runs.isEmpty()) {
            return emptyList()
        }
        // Один SQL-запрос вместо N+1 — node_runs всех запусков сразу.
        val nodesByRun = nodeRuns.listByWorkflowRunIds(runs.map { it.id })
        return runs.map { run ->
            val nodeDtos = (nodesByRun[run.id] ?: emptyList()).map { it.toDto() }
            run.toDto(nodeDtos)
        }
    }

    fun getNodeRun(nodeRunId: Long): NodeRun =
        nodeRuns.findById(nodeRunId)?.toDto() ?: throw NotFoundException("Node run not found")

    private fun WorkflowRunRepository.WorkflowRunRow.toDto(nodes: List<NodeRun>): WorkflowRun {
        val started = this.startedAt?.toInstant()
        val finished = this.finishedAt?.toInstant()
        val durationMs = if (started != null && finished != null) {
            Duration.between(started, finished).toMillis().coerceAtLeast(0)
        } else {
            null
        }
        return WorkflowRun(
            id = this.id.toString(),
            workflowId = this.workflowId.toString(),
            status = this.status,
            startedAt = started?.toString(),
            finishedAt = finished?.toString(),
            durationMs = durationMs,
            input = this.inputJson?.let(::parseJson),
            output = this.outputJson?.let(::parseJson),
            startNodeId = this.startNodeId,
            nodes = nodes,
        )
    }

    private fun NodeRunRepository.NodeRunRow.toDto(): NodeRun =
        NodeRun(
            id = this.id.toString(),
            workflowRunId = this.workflowRunId.toString(),
            nodeId = this.nodeId,
            status = this.status,
            startedAt = this.startedAt?.toInstant()?.toString(),
            finishedAt = this.finishedAt?.toInstant()?.toString(),
            input = this.inputJson?.let(::parseJson),
            output = this.outputJson?.let(::parseJson),
            errorMessage = this.errorMessage,
        )

    private fun parseJson(json: String): JsonNode = objectMapper.readTree(json)
}
