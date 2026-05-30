package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import java.time.Duration
import java.util.UUID

/**
 * Интеграционные тесты функций, добавленных для полного соответствия ТЗ:
 *  - детекция циклов с диагностическим сообщением (требование 6);
 *  - откат к именованной версии — append-only (требование 7);
 *  - отладочный запуск одной ноды с фиксацией в истории (требование 14).
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = ["app.seed.demo-workflows-enabled=false"],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ru.startem.aelevena.MvpIntegrationTests.ContainersConfig::class)
class Phase2FeaturesIntegrationTest {

    companion object {
        @Container
        val minio: GenericContainer<*> = GenericContainer("minio/minio:latest")
            .withEnv("MINIO_ROOT_USER", "minioadmin")
            .withEnv("MINIO_ROOT_PASSWORD", "minioadmin")
            .withCommand("server /data --console-address :9001")
            .withExposedPorts(9000)
            .withStartupTimeout(Duration.ofSeconds(60))

        @JvmStatic
        @DynamicPropertySource
        fun minioProperties(registry: DynamicPropertyRegistry) {
            minio.start()
            registry.add("app.s3.endpoint") { "http://localhost:${minio.getMappedPort(9000)}" }
            registry.add("app.s3.region") { "us-east-1" }
            registry.add("app.s3.bucket") { "a11a-blobs" }
            registry.add("app.s3.access-key") { "minioadmin" }
            registry.add("app.s3.secret-key") { "minioadmin" }
            registry.add("app.s3.path-style-access") { "true" }
        }
    }

    @Autowired private lateinit var workflowService: WorkflowService
    @Autowired private lateinit var runEnqueueService: RunEnqueueService
    @Autowired private lateinit var workflowRuns: WorkflowRunRepository
    @Autowired private lateinit var nodeRuns: NodeRunRepository
    @Autowired private lateinit var revisions: WorkflowRevisionRepository
    @Autowired private lateinit var debugSessions: DebugSessionService
    @Autowired private lateinit var objectMapper: ObjectMapper

    @Test
    fun `cyclic graph fails with Cycle detected message and no node runs created`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "cycle-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "a", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "A")),
                Node(id = "b", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "B")),
            ),
            connections = listOf(
                Connection(id = "e-ab", source = "a", target = "b"),
                Connection(id = "e-ba", source = "b", target = "a"),
            ),
        )
        workflowService.updateGraph(versionId, graph)

        val runId = runEnqueueService.enqueue(workflowId, objectMapper.readTree("[]"))
        val finished = waitUntilFinished(runId)
        assertEquals("failed", finished.status)
        val output = finished.outputJson?.let { objectMapper.readTree(it) }
        assertNotNull(output, "output должен содержать диагностику")
        assertEquals("Cycle detected in workflow graph", output!!.get("error").asText())
        assertTrue(nodeRuns.listByWorkflowRun(runId).isEmpty(), "при цикле ноды не должны запускаться")
    }

    @Test
    fun `restoreVersion creates append-only revision with past graph`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "restore-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        // revision 2: single node graph
        val oneNode = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(Node(id = "only", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "Only"))),
            connections = emptyList(),
        )
        workflowService.updateGraph(versionId, oneNode)

        // именованная версия v1.0 на текущей ревизии
        val version = workflowService.createVersion(workflowId, "v1.0")
        assertEquals("v1.0", version.tag)

        // revision 3: two-node graph
        val twoNodes = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "only", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "Only")),
                Node(id = "extra", type = "dataflow.map", position = Position(1.0, 0.0), data = NodeData(label = "Extra")),
            ),
            connections = listOf(Connection(id = "e", source = "only", target = "extra")),
        )
        workflowService.updateGraph(versionId, twoNodes)
        val nextRevBefore = revisions.nextRevisionNumber(workflowId)

        // restore -> новая ревизия с графом v1.0 (один узел)
        val restored = workflowService.restoreVersion(workflowId, version.id.toLong())
        assertEquals(1, restored.nodes.size, "после отката должен остаться один узел")
        assertEquals("only", restored.nodes.first().id)

        val nextRevAfter = revisions.nextRevisionNumber(workflowId)
        assertEquals(nextRevBefore + 1, nextRevAfter, "откат должен создавать новую ревизию (append-only)")

        // текущая версия workflow теперь отдаёт граф v1.0
        val current = workflowService.getWorkflow(workflowId)
        assertEquals(1, current.graph.nodes.size)
    }

    @Test
    fun `debugRunNode runs only selected node and records debug workflow_run`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "debug-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "first", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "First")),
                Node(id = "second", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "Second")),
            ),
            connections = listOf(Connection(id = "e", source = "first", target = "second")),
        )
        workflowService.updateGraph(versionId, graph)

        val result = debugSessions.debugRunNode(workflowId, "second", objectMapper.readTree("[1,2,3]"))
        assertEquals("success", result.status)
        assertEquals("second", result.nodeId)

        val runId = result.runId.toLong()
        val run = workflowRuns.findById(runId)!!
        assertTrue(run.isDebug, "отладочный запуск должен быть помечен is_debug")

        val nodeRunList = nodeRuns.listByWorkflowRun(runId)
        assertEquals(1, nodeRunList.size, "должна быть ровно одна node_run — только выбранная нода")
        assertEquals("second", nodeRunList.first().nodeId)
    }

    @Test
    fun `debugRunNode records failure diagnostics for bad input`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "debug-fail-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        // http-нода без config.url упадёт с IllegalArgumentException
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "bad", type = "http", position = Position(0.0, 0.0), data = NodeData(label = "Bad", config = objectMapper.readTree("{}"))),
            ),
            connections = emptyList(),
        )
        workflowService.updateGraph(versionId, graph)

        val result = debugSessions.debugRunNode(workflowId, "bad", objectMapper.readTree("{}"))
        assertEquals("failed", result.status)
        assertNotNull(result.errorMessage)

        val run = workflowRuns.findById(result.runId.toLong())!!
        assertEquals("failed", run.status)
        assertTrue(run.isDebug)
        val nodeRun = nodeRuns.listByWorkflowRun(result.runId.toLong()).first()
        assertEquals("failed", nodeRun.status)
        assertNotNull(nodeRun.errorMessage)
    }

    @Test
    fun `manual run still not flagged as debug`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "manual-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(Node(id = "n", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "N"))),
                connections = emptyList(),
            ),
        )
        val runId = runEnqueueService.enqueue(workflowId, objectMapper.readTree("[]"))
        val finished = waitUntilFinished(runId)
        assertFalse(finished.isDebug, "обычный запуск не должен быть отладочным")
    }

    private fun waitUntilFinished(runId: Long, timeout: Duration = Duration.ofSeconds(30)): WorkflowRunRepository.WorkflowRunRow {
        val deadline = System.currentTimeMillis() + timeout.toMillis()
        while (System.currentTimeMillis() < deadline) {
            val row = workflowRuns.findById(runId)
            if (row != null && row.status != "queued" && row.status != "running") {
                return row
            }
            Thread.sleep(100)
        }
        throw IllegalStateException("Run $runId did not finish in ${timeout.seconds}s")
    }
}
