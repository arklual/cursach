package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.NullNode
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.DebugFailedNode
import ru.startem.aelevena.api.dto.DebugNodeRunResult
import ru.startem.aelevena.api.dto.DebugSessionDto
import ru.startem.aelevena.blob.BlobService
import ru.startem.aelevena.executor.NodeExecutorRegistry
import ru.startem.aelevena.executor.SplitEnvelope
import ru.startem.aelevena.workflow.model.ConnectionSkeleton
import ru.startem.aelevena.workflow.model.GraphSkeleton
import ru.startem.aelevena.workflow.model.NodeSkeleton
import ru.startem.aelevena.workflow.persistence.WorkflowVersionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import ru.startem.aelevena.ws.RunEventBroadcaster
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@Service
class DebugSessionService(
    private val workflows: WorkflowsRepository,
    private val versions: WorkflowVersionRepository,
    private val revisions: WorkflowRevisionRepository,
    private val blobService: BlobService,
    private val executors: NodeExecutorRegistry,
    private val objectMapper: ObjectMapper,
    private val workflowRuns: WorkflowRunRepository,
    private val nodeRuns: NodeRunRepository,
    private val runEvents: RunEventBroadcaster,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val sessions = ConcurrentHashMap<String, Session>()

    companion object {
        private const val TTL_MILLIS = 60L * 60_000L
    }

    fun start(workflowId: UUID, input: JsonNode?, startNodeId: String? = null): DebugSessionDto {
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val versionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")
        val version = versions.findById(versionId) ?: throw NotFoundException("Version not found")
        val revision = revisions.findById(version.rootRevisionId)
            ?: throw NotFoundException("Revision not found")
        val skeleton = objectMapper.readValue(revision.graphSkeletonJson, GraphSkeleton::class.java)

        val reachable = reachableNodeIds(skeleton, startNodeId)
        if (reachable.isEmpty()) {
            throw BadRequestException("Workflow has no reachable nodes")
        }

        val session = Session(
            sessionId = UUID.randomUUID().toString(),
            workflowId = workflowId,
            versionId = versionId,
            skeleton = skeleton,
            reachable = reachable,
            input = input,
        )
        sessions[session.sessionId] = session
        gc()
        return session.toDto()
    }

    fun debugRunNode(workflowId: UUID, nodeId: String, input: JsonNode?): DebugNodeRunResult {
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val versionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")
        val version = versions.findById(versionId) ?: throw NotFoundException("Version not found")
        val revision = revisions.findById(version.rootRevisionId)
            ?: throw NotFoundException("Revision not found")
        val skeleton = objectMapper.readValue(revision.graphSkeletonJson, GraphSkeleton::class.java)
        val node = skeleton.nodes.firstOrNull { it.id == nodeId }
            ?: throw NotFoundException("Node $nodeId not found in workflow")

        val executor = executors.get(node.type)
            ?: throw BadRequestException("Unsupported node type: ${node.type}")

        val effectiveInput = input ?: NullNode.instance
        val runId = workflowRuns.insertQueued(
            workflowId = workflowId,
            workflowRevisionId = version.rootRevisionId,
            inputJson = objectMapper.writeValueAsString(effectiveInput),
            startNodeId = nodeId,
            isDebug = true,
        )
        workflowRuns.markRunning(runId)
        runEvents.workflowStarted(workflowId, runId)

        val inputNode = objectMapper.createObjectNode().apply {
            set<JsonNode>("runInput", effectiveInput)
            set<JsonNode>("inputs", objectMapper.createObjectNode())
        }

        val nodeRunId = nodeRuns.insertQueued(runId, nodeId, node.data?.configHash, nodeType = node.type)
        nodeRuns.markRunning(nodeRunId, objectMapper.writeValueAsString(inputNode))
        runEvents.nodeReached(workflowId, runId, nodeId)
        runEvents.nodeAction(workflowId, runId, nodeId)

        return try {
            val config = node.data?.configHash?.let { blobService.getJsonTree(it) }
            val out = executor.execute(nodeId, config, inputNode)
            nodeRuns.markSuccess(nodeRunId, objectMapper.writeValueAsString(out))
            runEvents.nodeExited(workflowId, runId, nodeId, "success")
            workflowRuns.markFinished(runId, "success", objectMapper.writeValueAsString(mapOf(nodeId to out)))
            runEvents.workflowFinished(workflowId, runId, "success")
            DebugNodeRunResult(
                runId = runId.toString(),
                workflowId = workflowId.toString(),
                nodeId = nodeId,
                status = "success",
                input = inputNode,
                output = out,
            )
        } catch (ex: Throwable) {
            val msg = (ex.cause ?: ex).message ?: ex.toString()
            nodeRuns.markFailed(nodeRunId, msg)
            runEvents.nodeExited(workflowId, runId, nodeId, "failed")
            workflowRuns.markFinished(
                runId,
                "failed",
                objectMapper.writeValueAsString(objectMapper.createObjectNode().put("error", msg)),
            )
            runEvents.workflowFinished(workflowId, runId, "failed")
            log.warn("Debug node run {} node {} failed: {}", runId, nodeId, msg)
            DebugNodeRunResult(
                runId = runId.toString(),
                workflowId = workflowId.toString(),
                nodeId = nodeId,
                status = "failed",
                input = inputNode,
                errorMessage = msg,
            )
        }
    }

    fun get(sessionId: String): DebugSessionDto {
        val session = sessions[sessionId] ?: throw NotFoundException("Debug session not found")
        return session.snapshotDto()
    }

    fun step(sessionId: String, nodeId: String? = null): DebugSessionDto {
        val session = sessions[sessionId] ?: throw NotFoundException("Debug session not found")
        session.lock.withLock {
            val ready = session.computeReady()
            if (ready.isEmpty()) {
                return session.toDto()
            }
            val target = nodeId?.also { id ->
                if (id !in ready) throw BadRequestException(
                    "Node $id is not ready. Ready: $ready",
                )
            } ?: ready.first()
            session.executeOne(target)
            return session.toDto()
        }
    }

    fun runToEnd(sessionId: String, maxSteps: Int = 1000): DebugSessionDto {
        val session = sessions[sessionId] ?: throw NotFoundException("Debug session not found")
        session.lock.withLock {
            var i = 0
            while (i < maxSteps) {
                val ready = session.computeReady()
                if (ready.isEmpty()) break
                session.executeOne(ready.first())
                i++
            }
            return session.toDto()
        }
    }

    fun close(sessionId: String) {
        sessions.remove(sessionId)
    }

    private fun gc() {
        val now = System.currentTimeMillis()
        sessions.entries.removeIf { (_, s) -> now - s.updatedAtMs > TTL_MILLIS }
    }

    private fun reachableNodeIds(skeleton: GraphSkeleton, startNodeId: String?): Set<String> {
        val all = skeleton.nodes.map { it.id }.toSet()
        if (startNodeId == null) return all
        if (startNodeId !in all) return emptySet()
        val out = mutableMapOf<String, MutableSet<String>>()
        all.forEach { out[it] = mutableSetOf() }
        skeleton.connections.forEach { c ->
            if (c.source in all && c.target in all) out.getValue(c.source).add(c.target)
        }
        val visited = mutableSetOf(startNodeId)
        val q = ArrayDeque<String>().apply { add(startNodeId) }
        while (q.isNotEmpty()) {
            val cur = q.removeFirst()
            out[cur].orEmpty().forEach { if (visited.add(it)) q.add(it) }
        }
        return visited
    }

    private inner class Session(
        val sessionId: String,
        val workflowId: UUID,
        val versionId: Long,
        val skeleton: GraphSkeleton,
        val reachable: Set<String>,
        val input: JsonNode?,
    ) {
        val lock = ReentrantLock()
        val createdAt: Instant = Instant.now()
        @Volatile var updatedAt: Instant = createdAt
        val updatedAtMs: Long get() = updatedAt.toEpochMilli()

        val outputs: MutableMap<String, JsonNode> = ConcurrentHashMap()
        val completed: MutableSet<String> = ConcurrentHashMap.newKeySet()
        val skipped: MutableSet<String> = ConcurrentHashMap.newKeySet()
        val failed: MutableMap<String, String> = ConcurrentHashMap()

        private val nodeById: Map<String, NodeSkeleton> = skeleton.nodes.associateBy { it.id }
        private val incomingByNode: Map<String, List<ConnectionSkeleton>> = skeleton.nodes
            .associate { node ->
                node.id to skeleton.connections.filter {
                    it.target == node.id && it.source in reachable && it.target in reachable
                }
            }

        fun computeReady(): List<String> {
            if (failed.isNotEmpty()) return emptyList()
            return reachable.filter { id ->
                if (id in completed || id in skipped) return@filter false
                val incoming = incomingByNode[id].orEmpty()
                incoming.all { edge -> edge.source in completed || edge.source in skipped }
            }
        }

        fun toDto(): DebugSessionDto {
            val ready = computeReady()
            val previews = ready.associateWith { nodeId ->
                buildNodeInput(input, incomingByNode[nodeId].orEmpty(), outputs, skipped)
            }
            val status = when {
                failed.isNotEmpty() -> "failed"
                ready.isEmpty() -> "done"
                completed.isEmpty() && skipped.isEmpty() -> "ready"
                else -> "stepping"
            }
            return DebugSessionDto(
                sessionId = sessionId,
                workflowId = workflowId.toString(),
                versionId = versionId.toString(),
                status = status,
                input = input,
                outputs = outputs.toMap(),
                completed = completed.toList().sorted(),
                skipped = skipped.toList().sorted(),
                failed = failed.entries.map { DebugFailedNode(it.key, it.value) },
                ready = ready,
                createdAt = createdAt,
                updatedAt = updatedAt,
                readyInputs = previews,
            )
        }

        fun snapshotDto(): DebugSessionDto = toDto()

        fun executeOne(nodeId: String) {
            require(nodeId in reachable) { "Node $nodeId is not reachable in this debug session" }
            val incoming = incomingByNode[nodeId].orEmpty()
            val liveIncoming = incoming.filter { edge ->
                if (edge.source in skipped) return@filter false
                val up = outputs[edge.source]
                val pickMismatch = up != null
                    && SplitEnvelope.isPickEnvelope(up)
                    && edge.variant != null
                    && SplitEnvelope.pickChosen(up) != edge.variant
                !pickMismatch
            }
            if (incoming.isNotEmpty() && liveIncoming.isEmpty()) {
                skipped.add(nodeId)
                updatedAt = Instant.now()
                return
            }
            val node = nodeById.getValue(nodeId)
            val inputNode = buildNodeInput(input, liveIncoming, outputs, skipped)
            val config = node.data?.configHash?.let { blobService.getJsonTree(it) }
            val executor = executors.get(node.type)
                ?: throw BadRequestException("Unsupported node type: ${node.type}")
            try {
                val out = executor.execute(nodeId, config, inputNode)
                outputs[nodeId] = out
                completed.add(nodeId)
            } catch (ex: Throwable) {
                val msg = (ex.cause ?: ex).message ?: ex.toString()
                failed[nodeId] = msg
                log.warn("Debug session {} node {} failed: {}", sessionId, nodeId, msg)
            } finally {
                updatedAt = Instant.now()
            }
        }
    }

    private fun buildNodeInput(
        runInput: JsonNode?,
        incomingEdges: List<ConnectionSkeleton>,
        outputs: Map<String, JsonNode>,
        skipped: Set<String>,
    ): JsonNode {
        val root = objectMapper.createObjectNode()
        root.set<JsonNode>("runInput", runInput ?: NullNode.instance)
        val inputs = objectMapper.createObjectNode()
        val inputVariants = objectMapper.createObjectNode()
        for (edge in incomingEdges) {
            if (edge.source in skipped) continue
            val upstream = outputs[edge.source] ?: NullNode.instance
            val delivered = SplitEnvelope.resolveForEdge(upstream, edge.variant)
            inputs.set<JsonNode>(edge.source, delivered)
            if (edge.variant != null) {
                inputVariants.put(edge.source, edge.variant)
            } else if (SplitEnvelope.isPickEnvelope(upstream)) {
                SplitEnvelope.pickChosen(upstream)?.let { inputVariants.put(edge.source, it) }
            }
        }
        root.set<JsonNode>("inputs", inputs)
        if (inputVariants.size() > 0) {
            root.set<JsonNode>("inputVariants", inputVariants)
        }
        return root
    }
}
