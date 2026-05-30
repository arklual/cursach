package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.NodeRun
import ru.startem.aelevena.api.dto.WorkflowRun
import ru.startem.aelevena.api.dto.WorkflowRunResult
import ru.startem.aelevena.workflow.model.GraphSkeleton
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.time.Duration
import java.util.UUID

@Service
@Transactional(readOnly = true)
class RunQueryService(
    private val workflows: WorkflowsRepository,
    private val workflowRuns: WorkflowRunRepository,
    private val nodeRuns: NodeRunRepository,
    private val revisions: WorkflowRevisionRepository,
    private val objectMapper: ObjectMapper,
) {
    fun getWorkflowRun(runId: Long): WorkflowRun {
        val row = workflowRuns.findById(runId) ?: throw NotFoundException("Run not found")
        val nodes = nodeRuns.listByWorkflowRun(runId).map { it.toDto() }
        return row.toDto(nodes)
    }

    fun getWorkflowRunResult(runId: Long): WorkflowRunResult {
        val row = workflowRuns.findById(runId) ?: throw NotFoundException("Run not found")
        val started = row.startedAt?.toInstant()
        val finished = row.finishedAt?.toInstant()
        val durationMs = if (started != null && finished != null) {
            Duration.between(started, finished).toMillis().coerceAtLeast(0)
        } else {
            null
        }
        return WorkflowRunResult(
            id = row.id.toString(),
            workflowId = row.workflowId.toString(),
            status = row.status,
            startedAt = started?.toString(),
            finishedAt = finished?.toString(),
            durationMs = durationMs,
            output = aggregatePipelineOutput(row),
        )
    }

    /**
     * Возвращает агрегированный результат пайплайна — выходы только терминальных нод
     * (узлов без исходящих рёбер внутри реально выполнявшегося подграфа).
     * Если терминальная нода одна — её output как есть; иначе — объект {nodeId: output}.
     */
    private fun aggregatePipelineOutput(row: WorkflowRunRepository.WorkflowRunRow): JsonNode? {
        val outputJson = row.outputJson ?: return null
        val perNode = objectMapper.readTree(outputJson) as? com.fasterxml.jackson.databind.node.ObjectNode ?: return null
        if (perNode.isEmpty) return null

        val revision = revisions.findById(row.workflowRevisionId) ?: return perNode
        val skeleton = objectMapper.readValue(revision.graphSkeletonJson, GraphSkeleton::class.java)
        val allNodeIds = skeleton.nodes.map { it.id }.toSet()
        val outgoing = mutableMapOf<String, MutableSet<String>>()
        allNodeIds.forEach { outgoing[it] = mutableSetOf() }
        skeleton.connections.forEach { c ->
            if (allNodeIds.contains(c.source) && allNodeIds.contains(c.target)) {
                outgoing.getValue(c.source).add(c.target)
            }
        }
        val reachable: Set<String> = row.startNodeId?.let { startId ->
            if (!allNodeIds.contains(startId)) return@let null
            val visited = mutableSetOf(startId)
            val queue = ArrayDeque<String>().apply { add(startId) }
            while (queue.isNotEmpty()) {
                val cur = queue.removeFirst()
                outgoing[cur].orEmpty().forEach { if (visited.add(it)) queue.add(it) }
            }
            visited
        } ?: allNodeIds

        val terminals = reachable.filter { id ->
            outgoing[id].orEmpty().none { it in reachable }
        }
        val terminalsWithOutput = terminals.filter { perNode.has(it) }
        return when {
            terminalsWithOutput.isEmpty() -> null
            terminalsWithOutput.size == 1 -> perNode.get(terminalsWithOutput.first())
            else -> {
                val agg = objectMapper.createObjectNode()
                terminalsWithOutput.forEach { agg.set<JsonNode>(it, perNode.get(it)) }
                agg
            }
        }
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
            isDebug = this.isDebug,
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
