package ru.startem.aelevena.workflow

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.Workflow
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.api.dto.WorkflowMeta
import ru.startem.aelevena.api.dto.WorkflowMetaUpdate
import ru.startem.aelevena.api.dto.WorkflowSnapshot
import ru.startem.aelevena.api.dto.WorkflowVersion
import ru.startem.aelevena.blob.BlobService
import ru.startem.aelevena.triggers.TriggerService
import ru.startem.aelevena.util.CanonicalJson
import ru.startem.aelevena.workflow.model.ConnectionSkeleton
import ru.startem.aelevena.workflow.model.GraphSkeleton
import ru.startem.aelevena.workflow.model.NodeDataSkeleton
import ru.startem.aelevena.workflow.model.NodeSkeleton
import ru.startem.aelevena.workflow.model.PositionSkeleton
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowSnapshotRepository
import ru.startem.aelevena.workflow.persistence.WorkflowVersionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.nio.charset.StandardCharsets
import java.util.UUID

data class GraphUpdatedEvent(val workflowId: UUID, val graph: WorkflowGraph)

@Service
class WorkflowService(
    private val workflows: WorkflowsRepository,
    private val revisions: WorkflowRevisionRepository,
    private val versions: WorkflowVersionRepository,
    private val snapshots: WorkflowSnapshotRepository,
    private val blobService: BlobService,
    private val canonicalJson: CanonicalJson,
    private val objectMapper: ObjectMapper,
    private val events: ApplicationEventPublisher,
    private val triggerService: TriggerService,
) {

    @Transactional
    fun createWorkflow(req: WorkflowCreateRequest, isDemo: Boolean = false): Workflow {
        val workflowId = UUID.randomUUID()
        workflows.insert(id = workflowId, name = req.name, description = req.description, isDemo = isDemo)

        val initialSkeleton = GraphSkeleton(nodes = emptyList(), connections = emptyList())
        val initialRevisionId = revisions.insert(
            workflowId = workflowId,
            revisionNumber = revisions.nextRevisionNumber(workflowId),
            graphSkeletonJson = skeletonJson(initialSkeleton),
        )

        val versionId = versions.insert(
            workflowId = workflowId,
            tag = "draft",
            rootRevisionId = initialRevisionId,
        )
        workflows.setCurrentVersion(workflowId, versionId)

        val row = workflows.findById(workflowId) ?: throw IllegalStateException("Just inserted workflow not found")
        val meta = row.toMeta()
        val graph = materializeGraph(versionId, initialSkeleton)
        return Workflow(meta = meta, graph = graph)
    }

    @Transactional(readOnly = true)
    fun listWorkflows(): List<WorkflowMeta> =
        workflows.list().map { it.toMeta() }

    @Transactional(readOnly = true)
    fun getWorkflow(workflowId: UUID): Workflow {
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")

        val versionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")

        val version = versions.findById(versionId) ?: throw NotFoundException("Version not found")
        val revision = revisions.findById(version.rootRevisionId) ?: throw NotFoundException("Revision not found")

        val skeleton = objectMapper.readValue(revision.graphSkeletonJson, GraphSkeleton::class.java)
        return Workflow(meta = workflow.toMeta(), graph = materializeGraph(version.id, skeleton))
    }

    @Transactional
    fun updateWorkflowMeta(workflowId: UUID, req: WorkflowMetaUpdate): WorkflowMeta {
        val updated = workflows.updateMeta(id = workflowId, name = req.name, description = req.description)
            ?: throw NotFoundException("Workflow not found")
        return updated.toMeta()
    }

    @Transactional
    fun deleteWorkflow(workflowId: UUID) {
        if (!workflows.delete(workflowId)) {
            throw NotFoundException("Workflow not found")
        }
    }

    @Transactional
    fun createVersion(workflowId: UUID): WorkflowVersion {
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val currentVersionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")

        val currentVersion = versions.findById(currentVersionId) ?: throw NotFoundException("Current version not found")
        val newVersionId = versions.insert(
            workflowId = workflowId,
            tag = null,
            rootRevisionId = currentVersion.rootRevisionId,
        )

        val newVersion = versions.findById(newVersionId) ?: throw IllegalStateException("Just inserted version not found")
        return newVersion.toDto()
    }

    @Transactional(readOnly = true)
    fun listVersions(workflowId: UUID): List<WorkflowVersion> {
        if (workflows.findById(workflowId) == null) {
            throw NotFoundException("Workflow not found")
        }
        return versions.listByWorkflow(workflowId).map { it.toDto() }
    }

    @Transactional
    fun updateGraph(versionId: Long, graph: WorkflowGraph): WorkflowGraph {
        val version = versions.findById(versionId) ?: throw NotFoundException("Version not found")

        validateGraph(graph)
        val skeleton = toSkeleton(graph)

        val newRevisionNumber = revisions.nextRevisionNumber(version.workflowId)
        val newRevisionId = revisions.insert(
            workflowId = version.workflowId,
            revisionNumber = newRevisionNumber,
            graphSkeletonJson = skeletonJson(skeleton),
        )

        versions.updateRootRevision(versionId, newRevisionId)
        workflows.touchUpdatedAt(version.workflowId)

        val materialized = materializeGraph(versionId, skeleton)
        triggerService.syncFromGraph(version.workflowId, materialized)
        events.publishEvent(GraphUpdatedEvent(version.workflowId, materialized))
        return materialized
    }

    @Transactional
    fun createSnapshot(workflowId: UUID, name: String, description: String?): WorkflowSnapshot {
        val trimmedName = name.trim()
        if (trimmedName.isEmpty()) {
            throw BadRequestException("Snapshot name must not be blank")
        }
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val versionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")
        val version = versions.findById(versionId) ?: throw NotFoundException("Version not found")

        val snapshotId = snapshots.insert(
            workflowId = workflowId,
            revisionId = version.rootRevisionId,
            name = trimmedName,
            description = description?.takeIf { it.isNotBlank() },
        )
        val row = snapshots.findById(snapshotId)
            ?: throw IllegalStateException("Just inserted snapshot not found")
        return row.toDto()
    }

    @Transactional(readOnly = true)
    fun listSnapshots(workflowId: UUID): List<WorkflowSnapshot> {
        if (workflows.findById(workflowId) == null) {
            throw NotFoundException("Workflow not found")
        }
        return snapshots.listByWorkflow(workflowId).map { it.toDto() }
    }

    @Transactional
    fun deleteSnapshot(workflowId: UUID, snapshotId: Long) {
        if (workflows.findById(workflowId) == null) {
            throw NotFoundException("Workflow not found")
        }
        val snapshot = snapshots.findById(snapshotId)
            ?: throw NotFoundException("Snapshot not found")
        if (snapshot.workflowId != workflowId) {
            throw NotFoundException("Snapshot not found")
        }
        snapshots.delete(snapshotId)
    }

    @Transactional
    fun restoreSnapshot(workflowId: UUID, snapshotId: Long): WorkflowGraph {
        val workflow = workflows.findById(workflowId) ?: throw NotFoundException("Workflow not found")
        val snapshot = snapshots.findById(snapshotId) ?: throw NotFoundException("Snapshot not found")
        if (snapshot.workflowId != workflowId) {
            throw NotFoundException("Snapshot not found")
        }

        val versionId = workflow.currentVersionId
            ?: versions.listByWorkflow(workflowId).firstOrNull()?.id
            ?: throw NotFoundException("Workflow has no versions")

        val sourceRevision = revisions.findById(snapshot.revisionId)
            ?: throw NotFoundException("Snapshot revision not found")
        val skeleton = objectMapper.readValue(sourceRevision.graphSkeletonJson, GraphSkeleton::class.java)

        // Restore = append-only ревизия с тем же graph_skeleton, чтобы история откатов сохранялась
        // и triggers/runs не теряли ссылку на старые ревизии.
        val newRevisionId = revisions.insert(
            workflowId = workflowId,
            revisionNumber = revisions.nextRevisionNumber(workflowId),
            graphSkeletonJson = sourceRevision.graphSkeletonJson,
        )
        versions.updateRootRevision(versionId, newRevisionId)
        workflows.touchUpdatedAt(workflowId)

        val materialized = materializeGraph(versionId, skeleton)
        triggerService.syncFromGraph(workflowId, materialized)
        events.publishEvent(GraphUpdatedEvent(workflowId, materialized))
        return materialized
    }

    private fun validateGraph(graph: WorkflowGraph) {
        val nodeIds = graph.nodes.map { it.id }
        if (nodeIds.size != nodeIds.toSet().size) {
            throw BadRequestException("Duplicate node ids")
        }

        val nodeIdSet = nodeIds.toSet()
        graph.connections.forEach { c ->
            if (!nodeIdSet.contains(c.source)) throw BadRequestException("Connection source not found: ${c.source}")
            if (!nodeIdSet.contains(c.target)) throw BadRequestException("Connection target not found: ${c.target}")
        }
    }

    private fun toSkeleton(graph: WorkflowGraph): GraphSkeleton {
        val nodes = graph.nodes.map { node ->
            val configHash = node.data?.config?.let { configJson ->
                val anyConfig: Any = objectMapper.convertValue(configJson, Any::class.java)
                blobService.putJsonIfMissing(anyConfig)
            }

            NodeSkeleton(
                id = node.id,
                type = node.type,
                position = node.position?.let { PositionSkeleton(it.x, it.y) },
                data = node.data?.let { NodeDataSkeleton(label = it.label, configHash = configHash, abConfig = it.abConfig) },
            )
        }

        val connections = graph.connections.map { c ->
            ConnectionSkeleton(
                id = c.id,
                source = c.source,
                target = c.target,
                sourceHandle = c.sourceHandle,
                targetHandle = c.targetHandle,
            )
        }

        return GraphSkeleton(nodes = nodes, connections = connections)
    }

    private fun materializeGraph(versionId: Long, skeleton: GraphSkeleton): WorkflowGraph {
        val nodes = skeleton.nodes.map { node ->
            val cfg = node.data?.configHash?.let { blobService.getJsonTree(it) }
            Node(
                id = node.id,
                type = node.type,
                position = node.position?.let { Position(it.x, it.y) },
                data = node.data?.let { NodeData(label = it.label, config = cfg, abConfig = it.abConfig) },
            )
        }
        val connections = skeleton.connections.map { c ->
            Connection(
                id = c.id,
                source = c.source,
                target = c.target,
                sourceHandle = c.sourceHandle,
                targetHandle = c.targetHandle,
            )
        }
        return WorkflowGraph(versionId = versionId.toString(), nodes = nodes, connections = connections)
    }

    private fun skeletonJson(skeleton: GraphSkeleton): String =
        String(canonicalJson.writeBytes(skeleton), StandardCharsets.UTF_8)

    private fun WorkflowsRepository.WorkflowRow.toMeta(): WorkflowMeta =
        WorkflowMeta(
            id = this.id.toString(),
            name = this.name,
            description = this.description,
            isDemo = this.isDemo,
            nodesCount = this.nodesCount,
            createdAt = this.createdAt.toInstant().toString(),
            updatedAt = this.updatedAt.toInstant().toString(),
        )

    private fun WorkflowVersionRepository.WorkflowVersionRow.toDto(): WorkflowVersion =
        WorkflowVersion(
            id = this.id.toString(),
            workflowId = this.workflowId.toString(),
            tag = this.versionTag,
            createdAt = this.createdAt.toInstant().toString(),
        )

    private fun WorkflowSnapshotRepository.WorkflowSnapshotRow.toDto(): WorkflowSnapshot =
        WorkflowSnapshot(
            id = this.id.toString(),
            workflowId = this.workflowId.toString(),
            name = this.name,
            description = this.description,
            createdAt = this.createdAt.toInstant().toString(),
        )
}

