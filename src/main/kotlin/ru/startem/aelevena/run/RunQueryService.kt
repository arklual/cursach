package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.NodeRun
import ru.startem.aelevena.api.dto.WorkflowRun
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.util.UUID

@Service
class RunQueryService(
    private val workflows: WorkflowsRepository,
    private val workflowRuns: WorkflowRunRepository,
    private val nodeRuns: NodeRunRepository,
    private val objectMapper: ObjectMapper,
) {
    fun getWorkflowRun(runId: Long): WorkflowRun =
        workflowRuns.findById(runId)?.toDto() ?: throw NotFoundException("Run not found")

    fun listWorkflowRuns(workflowId: UUID): List<WorkflowRun> =
        workflows.findById(workflowId)?.let {
            workflowRuns.listByWorkflow(workflowId).map { run -> run.toDto() }
        } ?: throw NotFoundException("Workflow not found")

    fun getNodeRun(nodeRunId: Long): NodeRun =
        nodeRuns.findById(nodeRunId)?.toDto() ?: throw NotFoundException("Node run not found")

    private fun WorkflowRunRepository.WorkflowRunRow.toDto(): WorkflowRun =
        WorkflowRun(
            id = this.id.toString(),
            workflowId = this.workflowId.toString(),
            status = this.status,
            startedAt = this.startedAt?.toInstant()?.toString(),
            finishedAt = this.finishedAt?.toInstant()?.toString(),
            input = this.inputJson?.let(::parseJson),
            output = this.outputJson?.let(::parseJson),
        )

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

