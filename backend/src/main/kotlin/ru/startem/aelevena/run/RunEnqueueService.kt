package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.workflow.persistence.WorkflowVersionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.util.UUID

@Service
class RunEnqueueService(
    private val workflows: WorkflowsRepository,
    private val versions: WorkflowVersionRepository,
    private val workflowRuns: WorkflowRunRepository,
    private val objectMapper: ObjectMapper,
    private val executionService: WorkflowExecutionService,
) {
    @Transactional
    fun enqueue(workflowId: UUID, input: JsonNode?, startNodeId: String? = null): Long {
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val versionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")

        val version = versions.findById(versionId) ?: throw NotFoundException("Version not found")
        val inputJson = input?.let { objectMapper.writeValueAsString(it) }
        val runId = workflowRuns.insertQueued(
            workflowId = workflowId,
            workflowRevisionId = version.rootRevisionId,
            inputJson = inputJson,
            startNodeId = startNodeId,
        )

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    executionService.start(runId)
                }
            })
        } else {
            executionService.start(runId)
        }

        return runId
    }
}
