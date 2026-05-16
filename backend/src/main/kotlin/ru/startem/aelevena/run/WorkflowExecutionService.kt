package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.NullNode
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.blob.BlobService
import ru.startem.aelevena.executor.NodeExecutorRegistry
import ru.startem.aelevena.workflow.model.GraphSkeleton
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.RejectedExecutionException

@Service
class WorkflowExecutionService(
    private val workflowRuns: WorkflowRunRepository,
    private val nodeRuns: NodeRunRepository,
    private val revisions: WorkflowRevisionRepository,
    private val blobService: BlobService,
    private val executors: NodeExecutorRegistry,
    private val objectMapper: ObjectMapper,
    private val workflowExecutor: ExecutorService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun start(runId: Long) {
        try {
            workflowExecutor.submit {
                try {
                    execute(runId)
                } catch (ex: Throwable) {
                    log.error("Workflow run {} failed unexpectedly", runId, ex)
                    runCatching { workflowRuns.markFinished(runId, "failed", outputJson = null) }
                }
            }
        } catch (ex: RejectedExecutionException) {
            log.error("Workflow executor rejected run {}", runId, ex)
            runCatching { workflowRuns.markFinished(runId, "failed", outputJson = null) }
            throw ex
        }
    }

    fun execute(runId: Long) {
        val run = workflowRuns.findById(runId) ?: throw NotFoundException("Run not found")
        val revision = revisions.findById(run.workflowRevisionId) ?: throw NotFoundException("Revision not found")
        val skeleton = objectMapper.readValue(revision.graphSkeletonJson, GraphSkeleton::class.java)

        val nodeById = skeleton.nodes.associateBy { it.id }
        val incoming = mutableMapOf<String, MutableSet<String>>()
        val outgoing = mutableMapOf<String, MutableSet<String>>()

        skeleton.nodes.forEach { n ->
            incoming[n.id] = mutableSetOf()
            outgoing[n.id] = mutableSetOf()
        }

        skeleton.connections.forEach { c ->
            val src = c.source
            val dst = c.target
            if (!incoming.containsKey(src) || !incoming.containsKey(dst)) {
                workflowRuns.markFinished(runId, "failed", outputJson = null)
                return
            }
            outgoing.getValue(src).add(dst)
            incoming.getValue(dst).add(src)
        }

        val topo = topologicalOrder(incoming.mapValues { it.value.size }, outgoing)
        if (topo == null) {
            workflowRuns.markFinished(runId, "failed", outputJson = null)
            return
        }

        val nodeRunIds = mutableMapOf<String, Long>()
        skeleton.nodes.forEach { node ->
            val nodeRunId = nodeRuns.insertQueued(
                workflowRunId = runId,
                nodeId = node.id,
                configHash = node.data?.configHash,
            )
            nodeRunIds[node.id] = nodeRunId
        }

        workflowRuns.markRunning(runId)

        val started = ConcurrentHashMap.newKeySet<String>()
        val outputs = ConcurrentHashMap<String, JsonNode>()

        val futures = mutableMapOf<String, CompletableFuture<JsonNode>>()
        topo.forEach { nodeId ->
            val deps = incoming[nodeId]?.toList().orEmpty()
            val depFutures = deps.mapNotNull { futures[it] }.toTypedArray()
            val ready = CompletableFuture.allOf(*depFutures)

            val f = ready.thenApplyAsync({
                val node = nodeById.getValue(nodeId)
                val nodeRunId = nodeRunIds.getValue(nodeId)

                val inputNode = buildNodeInput(run.inputJson, deps, outputs)
                started.add(nodeId)
                nodeRuns.markRunning(nodeRunId, objectMapper.writeValueAsString(inputNode))

                val config = node.data?.configHash?.let { blobService.getJsonTree(it) }
                val executor = executors.get(node.type)
                    ?: throw IllegalArgumentException("Unsupported node type: ${node.type}")

                val out = executor.execute(nodeId, config, inputNode)
                outputs[nodeId] = out
                nodeRuns.markSuccess(nodeRunId, objectMapper.writeValueAsString(out))
                out
            }, workflowExecutor).whenComplete { _, ex ->
                if (ex != null) {
                    val nodeRunId = nodeRunIds.getValue(nodeId)
                    if (started.contains(nodeId)) {
                        nodeRuns.markFailed(nodeRunId, rootMessage(ex))
                    } else {
                        nodeRuns.markSkipped(nodeRunId, "Dependency failed")
                    }
                }
            }

            futures[nodeId] = f
        }

        val all = CompletableFuture.allOf(*futures.values.toTypedArray())
        val status = try {
            all.join()
            "success"
        } catch (_: Exception) {
            "failed"
        }

        val outputJson = objectMapper.writeValueAsString(outputsToJson(outputs))
        workflowRuns.markFinished(runId, status = status, outputJson = outputJson)
    }

    private fun buildNodeInput(runInputJson: String?, deps: List<String>, outputs: Map<String, JsonNode>): JsonNode {
        val root = objectMapper.createObjectNode()
        val runInput = runInputJson?.let { objectMapper.readTree(it) } ?: NullNode.instance
        root.set<JsonNode>("runInput", runInput)

        val inputs = objectMapper.createObjectNode()
        deps.forEach { depId ->
            inputs.set<JsonNode>(depId, outputs[depId] ?: NullNode.instance)
        }
        root.set<JsonNode>("inputs", inputs)
        return root
    }

    private fun outputsToJson(outputs: Map<String, JsonNode>): JsonNode {
        val root = objectMapper.createObjectNode()
        outputs.forEach { (k, v) -> root.set<JsonNode>(k, v) }
        return root
    }

    private fun topologicalOrder(
        inDegreeInit: Map<String, Int>,
        outgoing: Map<String, Set<String>>,
    ): List<String>? {
        val inDegree = inDegreeInit.toMutableMap()
        val queue = ArrayDeque<String>()
        inDegree.forEach { (node, deg) -> if (deg == 0) queue.add(node) }

        val result = mutableListOf<String>()
        while (queue.isNotEmpty()) {
            val n = queue.removeFirst()
            result.add(n)
            outgoing[n].orEmpty().forEach { m ->
                val next = (inDegree[m] ?: 0) - 1
                inDegree[m] = next
                if (next == 0) queue.add(m)
            }
        }

        return if (result.size == inDegree.size) result else null
    }

    private fun rootMessage(ex: Throwable): String {
        val root = when (ex) {
            is CompletionException -> ex.cause ?: ex
            else -> ex
        }
        return root.message ?: root.toString()
    }
}

