package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.NullNode
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.blob.BlobService
import ru.startem.aelevena.executor.NodeExecutorRegistry
import ru.startem.aelevena.executor.SplitEnvelope
import ru.startem.aelevena.workflow.model.ConnectionSkeleton
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
    /** Лёгкий пул для оркестрации (setup / финализация). Не блокируется на ноды. */
    private val workflowExecutor: ExecutorService,
    /** Тяжёлый пул для собственно исполнения нод (HTTP/Python/Dataflow). */
    @Qualifier("nodeExecutor") private val nodeExecutor: ExecutorService,
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
            // Не должно случиться: пул использует CallerRunsPolicy + неограниченную очередь.
            log.error("Workflow executor rejected run {}", runId, ex)
            runCatching { workflowRuns.markFinished(runId, "failed", outputJson = null) }
            throw ex
        }
    }

    /**
     * Полностью non-blocking. После сборки графа фьючерсов метод возвращается, освобождая
     * orchestrator-поток. Финализация runа произойдёт в `whenCompleteAsync(workflowExecutor)`
     * после того как все node-фьючерсы добегут. Это устраняет thread-pool starvation deadlock,
     * который был при синхронном `allOf().join()` (orchestrator занимал слот и ждал ноды,
     * для которых уже не было свободных слотов).
     */
    fun execute(runId: Long) {
        val run = workflowRuns.findById(runId) ?: throw NotFoundException("Run not found")
        val revision = revisions.findById(run.workflowRevisionId) ?: throw NotFoundException("Revision not found")
        val skeleton = objectMapper.readValue(revision.graphSkeletonJson, GraphSkeleton::class.java)

        val allNodeIds = skeleton.nodes.map { it.id }.toSet()
        val outgoingAll = mutableMapOf<String, MutableSet<String>>()
        allNodeIds.forEach { outgoingAll[it] = mutableSetOf() }
        skeleton.connections.forEach { c ->
            if (!allNodeIds.contains(c.source) || !allNodeIds.contains(c.target)) {
                workflowRuns.markFinished(runId, "failed", outputJson = null)
                return
            }
            outgoingAll.getValue(c.source).add(c.target)
        }

        val reachableNodeIds: Set<String> = run.startNodeId?.let { startId ->
            if (!allNodeIds.contains(startId)) {
                workflowRuns.markFinished(runId, "failed", outputJson = null)
                return
            }
            val visited = mutableSetOf<String>()
            val queue = ArrayDeque<String>()
            queue.add(startId)
            visited.add(startId)
            while (queue.isNotEmpty()) {
                val cur = queue.removeFirst()
                outgoingAll[cur].orEmpty().forEach { nxt ->
                    if (visited.add(nxt)) queue.add(nxt)
                }
            }
            visited
        } ?: allNodeIds

        val nodes = skeleton.nodes.filter { reachableNodeIds.contains(it.id) }
        val nodeById = nodes.associateBy { it.id }
        val incoming = mutableMapOf<String, MutableSet<String>>()
        val outgoing = mutableMapOf<String, MutableSet<String>>()
        nodes.forEach { n ->
            incoming[n.id] = mutableSetOf()
            outgoing[n.id] = mutableSetOf()
        }
        skeleton.connections.forEach { c ->
            if (reachableNodeIds.contains(c.source) && reachableNodeIds.contains(c.target)) {
                outgoing.getValue(c.source).add(c.target)
                incoming.getValue(c.target).add(c.source)
            }
        }

        val topo = topologicalOrder(incoming.mapValues { it.value.size }, outgoing)
        if (topo == null) {
            workflowRuns.markFinished(runId, "failed", outputJson = null)
            return
        }

        val nodeRunIds = mutableMapOf<String, Long>()
        nodes.forEach { node ->
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
        val skippedSet = ConcurrentHashMap.newKeySet<String>()

        val futures = mutableMapOf<String, CompletableFuture<JsonNode>>()
        topo.forEach { nodeId ->
            val incomingEdges: List<ConnectionSkeleton> = skeleton.connections.filter { c ->
                c.target == nodeId && reachableNodeIds.contains(c.source) && reachableNodeIds.contains(c.target)
            }
            val depFutures = incomingEdges.map { it.source }.mapNotNull { futures[it] }.toTypedArray()
            val ready = CompletableFuture.allOf(*depFutures)

            // Ноды бегут на тяжёлом nodeExecutor; orchestrator-пулу остаётся только координация.
            val f = ready.thenApplyAsync({
                val nodeRunId = nodeRunIds.getValue(nodeId)

                val liveIncoming = incomingEdges.filter { edge ->
                    if (skippedSet.contains(edge.source)) {
                        return@filter false
                    }
                    val up = outputs[edge.source]
                    val isPickMismatch = up != null
                        && SplitEnvelope.isPickEnvelope(up)
                        && edge.variant != null
                        && SplitEnvelope.pickChosen(up) != edge.variant
                    !isPickMismatch
                }

                if (incomingEdges.isNotEmpty() && liveIncoming.isEmpty()) {
                    skippedSet.add(nodeId)
                    nodeRuns.markSkipped(nodeRunId, "Branch not selected")
                    return@thenApplyAsync NullNode.instance as JsonNode
                }

                val node = nodeById.getValue(nodeId)
                val inputNode = buildNodeInput(run.inputJson, liveIncoming, outputs, skippedSet)
                started.add(nodeId)
                nodeRuns.markRunning(nodeRunId, objectMapper.writeValueAsString(inputNode))

                val config = node.data?.configHash?.let { blobService.getJsonTree(it) }
                val executor = executors.get(node.type)
                    ?: throw IllegalArgumentException("Unsupported node type: ${node.type}")

                val out = executor.execute(nodeId, config, inputNode)
                outputs[nodeId] = out
                nodeRuns.markSuccess(nodeRunId, objectMapper.writeValueAsString(out))
                out
            }, nodeExecutor).whenComplete { _, ex ->
                if (ex != null && !skippedSet.contains(nodeId)) {
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

        // Финализация — асинхронно. Orchestrator-поток здесь освобождается; результат записывается
        // на orchestrator-пуле в callback, когда все node-фьючерсы будут завершены.
        val all = CompletableFuture.allOf(*futures.values.toTypedArray())
        all.whenCompleteAsync({ _, ex ->
            try {
                val status = if (ex == null) "success" else "failed"
                val outputJson = objectMapper.writeValueAsString(outputsToJson(outputs))
                workflowRuns.markFinished(runId, status = status, outputJson = outputJson)
            } catch (finalEx: Throwable) {
                log.error("Run {} finalize failed", runId, finalEx)
                runCatching { workflowRuns.markFinished(runId, "failed", outputJson = null) }
            }
        }, workflowExecutor)
    }

    private fun buildNodeInput(
        runInputJson: String?,
        incomingEdges: List<ConnectionSkeleton>,
        outputs: Map<String, JsonNode>,
        skipped: Set<String>,
    ): JsonNode {
        val root = objectMapper.createObjectNode()
        val runInput = runInputJson?.let { objectMapper.readTree(it) } ?: NullNode.instance
        root.set<JsonNode>("runInput", runInput)

        val inputs = objectMapper.createObjectNode()
        val inputVariants = objectMapper.createObjectNode()
        for (edge in incomingEdges) {
            if (skipped.contains(edge.source)) {
                continue
            }
            val upstreamOutput = outputs[edge.source] ?: NullNode.instance
            val delivered = SplitEnvelope.resolveForEdge(upstreamOutput, edge.variant)
            inputs.set<JsonNode>(edge.source, delivered)
            if (edge.variant != null) {
                inputVariants.put(edge.source, edge.variant)
            } else if (SplitEnvelope.isPickEnvelope(upstreamOutput)) {
                SplitEnvelope.pickChosen(upstreamOutput)?.let { inputVariants.put(edge.source, it) }
            }
        }
        root.set<JsonNode>("inputs", inputs)
        if (inputVariants.size() > 0) {
            root.set<JsonNode>("inputVariants", inputVariants)
        }
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
