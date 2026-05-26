package ru.startem.aelevena.workflow

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.mockito.Mockito.anyLong
import org.mockito.Mockito.mock
import org.springframework.context.ApplicationEventPublisher
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.WorkflowMetaUpdate
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.blob.BlobService
import ru.startem.aelevena.triggers.TriggerService
import ru.startem.aelevena.util.CanonicalJson
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowSnapshotRepository
import ru.startem.aelevena.workflow.persistence.WorkflowVersionRepository
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.time.OffsetDateTime
import java.util.UUID

/**
 * Unit-level validateGraph coverage — drives all BadRequestException branches via mocked
 * persistence layer. The integration test only flips a couple of these (`branch.split`
 * missing variants, duplicate node ids); this file fills out the remaining branches that
 * dominate the WorkflowService coverage gap.
 */
class WorkflowServiceValidationTest {

    private val workflows: WorkflowsRepository = mock(WorkflowsRepository::class.java)
    private val revisions: WorkflowRevisionRepository = mock(WorkflowRevisionRepository::class.java)
    private val versions: WorkflowVersionRepository = mock(WorkflowVersionRepository::class.java)
    private val snapshots: WorkflowSnapshotRepository = mock(WorkflowSnapshotRepository::class.java)
    private val blobService: BlobService = mock(BlobService::class.java)
    private val canonicalJson: CanonicalJson = mock(CanonicalJson::class.java)
    private val mapper: ObjectMapper = jacksonObjectMapper()
    private val events: ApplicationEventPublisher = mock(ApplicationEventPublisher::class.java)
    private val triggerService: TriggerService = mock(TriggerService::class.java)

    private val workflowId = UUID.randomUUID()
    private val versionId = 1L

    private fun newService(): WorkflowService {
        val versionRow = WorkflowVersionRepository.WorkflowVersionRow(
            id = versionId, workflowId = workflowId, versionTag = "draft",
            rootRevisionId = 1L, createdAt = OffsetDateTime.now(),
        )
        `when`(versions.findById(anyLong())).thenReturn(versionRow)
        return WorkflowService(
            workflows, revisions, versions, snapshots,
            blobService, canonicalJson, mapper, events, triggerService,
        )
    }

    private fun node(id: String, type: String = "stub", config: String? = null): Node =
        Node(
            id = id, type = type,
            position = Position(0.0, 0.0),
            data = NodeData(label = id, config = config?.let { mapper.readTree(it) }),
        )

    private fun serviceWithoutVersionStub(): WorkflowService = WorkflowService(
        workflows, revisions, versions, snapshots,
        blobService, canonicalJson, mapper, events, triggerService,
    )

    @Test
    fun `updateGraph rejects unknown version`() {
        `when`(versions.findById(anyLong())).thenReturn(null)
        val graph = WorkflowGraph(versionId = "1", nodes = emptyList(), connections = emptyList())
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().updateGraph(123L, graph)
        }
    }

    @Test
    fun `getWorkflow rejects unknown workflow`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().getWorkflow(workflowId)
        }
    }

    @Test
    fun `updateWorkflowMeta returns 404 when updateMeta yields null`() {
        // Stub the no-arg path: pass concrete values that match the actual call.
        `when`(workflows.updateMeta(workflowId, "renamed", null)).thenReturn(null)
        val ex = assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().updateWorkflowMeta(
                workflowId,
                WorkflowMetaUpdate(name = "renamed"),
            )
        }
        assertTrue(ex.message!!.contains("Workflow"))
    }

    @Test
    fun `deleteWorkflow throws when no rows affected`() {
        `when`(workflows.delete(workflowId)).thenReturn(false)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().deleteWorkflow(workflowId)
        }
    }

    @Test
    fun `createSnapshot rejects blank name (whitespace only)`() {
        val ex = assertThrows(BadRequestException::class.java) {
            serviceWithoutVersionStub().createSnapshot(workflowId, "   ", null)
        }
        assertTrue(ex.message!!.contains("blank"))
    }

    @Test
    fun `createSnapshot 404 when workflow missing`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().createSnapshot(workflowId, "name", null)
        }
    }

    @Test
    fun `listSnapshots 404 when workflow missing`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().listSnapshots(workflowId)
        }
    }

    @Test
    fun `deleteSnapshot 404 when workflow missing`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().deleteSnapshot(workflowId, 1L)
        }
    }

    @Test
    fun `deleteSnapshot 404 when snapshot missing`() {
        val workflowRow = WorkflowsRepository.WorkflowRow(
            id = workflowId, name = "wf", description = null,
            isDemo = false, nodesCount = 0,
            currentVersionId = 1L,
            createdAt = OffsetDateTime.now(), updatedAt = OffsetDateTime.now(),
        )
        `when`(workflows.findById(workflowId)).thenReturn(workflowRow)
        `when`(snapshots.findById(1L)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().deleteSnapshot(workflowId, 1L)
        }
    }

    @Test
    fun `deleteSnapshot 404 when snapshot belongs to different workflow`() {
        val workflowRow = WorkflowsRepository.WorkflowRow(
            id = workflowId, name = "wf", description = null,
            isDemo = false, nodesCount = 0,
            currentVersionId = 1L,
            createdAt = OffsetDateTime.now(), updatedAt = OffsetDateTime.now(),
        )
        `when`(workflows.findById(workflowId)).thenReturn(workflowRow)
        val otherSnapshot = ru.startem.aelevena.workflow.persistence.WorkflowSnapshotRepository.WorkflowSnapshotRow(
            id = 1L, workflowId = UUID.randomUUID(),
            revisionId = 1L, name = "s", description = null,
            createdAt = OffsetDateTime.now(),
        )
        `when`(snapshots.findById(1L)).thenReturn(otherSnapshot)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().deleteSnapshot(workflowId, 1L)
        }
    }

    @Test
    fun `restoreSnapshot 404 when workflow missing`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().restoreSnapshot(workflowId, 1L)
        }
    }

    @Test
    fun `restoreSnapshot 404 when snapshot missing`() {
        val workflowRow = WorkflowsRepository.WorkflowRow(
            id = workflowId, name = "wf", description = null,
            isDemo = false, nodesCount = 0,
            currentVersionId = 1L,
            createdAt = OffsetDateTime.now(), updatedAt = OffsetDateTime.now(),
        )
        `when`(workflows.findById(workflowId)).thenReturn(workflowRow)
        `when`(snapshots.findById(1L)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().restoreSnapshot(workflowId, 1L)
        }
    }

    @Test
    fun `restoreSnapshot 404 when snapshot belongs to other workflow`() {
        val workflowRow = WorkflowsRepository.WorkflowRow(
            id = workflowId, name = "wf", description = null,
            isDemo = false, nodesCount = 0,
            currentVersionId = 1L,
            createdAt = OffsetDateTime.now(), updatedAt = OffsetDateTime.now(),
        )
        `when`(workflows.findById(workflowId)).thenReturn(workflowRow)
        val foreign = ru.startem.aelevena.workflow.persistence.WorkflowSnapshotRepository.WorkflowSnapshotRow(
            id = 1L, workflowId = UUID.randomUUID(),
            revisionId = 1L, name = "s", description = null,
            createdAt = OffsetDateTime.now(),
        )
        `when`(snapshots.findById(1L)).thenReturn(foreign)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().restoreSnapshot(workflowId, 1L)
        }
    }

    @Test
    fun `listVersions 404 when workflow missing`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().listVersions(workflowId)
        }
    }

    @Test
    fun `createVersion 404 when workflow missing`() {
        `when`(workflows.findById(workflowId)).thenReturn(null)
        assertThrows(NotFoundException::class.java) {
            serviceWithoutVersionStub().createVersion(workflowId)
        }
    }

    @Test
    fun `duplicate node ids rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(node("x"), node("x")),
            connections = emptyList(),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("Duplicate"))
    }

    @Test
    fun `connection with missing source rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(node("a")),
            connections = listOf(Connection(id = "c", source = "missing", target = "a")),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("source"))
    }

    @Test
    fun `connection with missing target rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(node("a")),
            connections = listOf(Connection(id = "c", source = "a", target = "missing")),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("target"))
    }

    @Test
    fun `branch_split with non-object config rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(node("s", "branch.split", config = """["array-config"]""")),
            connections = emptyList(),
        )
        assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
    }

    @Test
    fun `branch_split with null data rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(Node(id = "s", type = "branch.split", position = Position(0.0, 0.0), data = null)),
            connections = emptyList(),
        )
        assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
    }

    @Test
    fun `branch_split with empty variants rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(node("s", "branch.split", config = """{"variants":[],"strategy":"random"}""")),
            connections = emptyList(),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("variants"))
    }

    @Test
    fun `branch_split with variants not array rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(node("s", "branch.split", config = """{"variants":{"k":"v"},"strategy":"random"}""")),
            connections = emptyList(),
        )
        assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
    }

    @Test
    fun `branch_split with zero total weight rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                node(
                    "s", "branch.split",
                    config = """{"variants":[{"key":"A","weight":0},{"key":"B","weight":0}],"strategy":"random"}""",
                ),
            ),
            connections = emptyList(),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("weights"))
    }

    @Test
    fun `branch_split hash strategy without userIdField rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                node(
                    "s", "branch.split",
                    config = """{"variants":[{"key":"A","weight":1}],"strategy":"hash"}""",
                ),
            ),
            connections = emptyList(),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("userIdField"))
    }

    @Test
    fun `branch_split modulo strategy without userIdField rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                node(
                    "s", "branch.split",
                    config = """{"variants":[{"key":"A","weight":1}],"strategy":"modulo"}""",
                ),
            ),
            connections = emptyList(),
        )
        assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
    }

    @Test
    fun `branch_split stratified without stratifyBy rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                node(
                    "s", "branch.split",
                    config = """{"variants":[{"key":"A","weight":1}],"strategy":"stratified","userIdField":"u"}""",
                ),
            ),
            connections = emptyList(),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("stratifyBy"))
    }

    @Test
    fun `branch_split outgoing edge without variant rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                node(
                    "s", "branch.split",
                    config = """{"variants":[{"key":"A","weight":1}],"strategy":"random"}""",
                ),
                node("t"),
            ),
            connections = listOf(Connection(id = "e", source = "s", target = "t")),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("missing variant"))
    }

    @Test
    fun `branch_split edge variant not in variants_key rejected`() {
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                node(
                    "s", "branch.split",
                    config = """{"variants":[{"key":"A","weight":1}],"strategy":"random"}""",
                ),
                node("t"),
            ),
            connections = listOf(Connection(id = "e", source = "s", target = "t", variant = "X")),
        )
        val ex = assertThrows(BadRequestException::class.java) {
            newService().updateGraph(versionId, graph)
        }
        assertTrue(ex.message!!.contains("not in"))
    }

}
