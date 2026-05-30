package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
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
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.blob.BlobIndexRepository
import ru.startem.aelevena.workflow.WorkflowService
import ru.startem.aelevena.workflow.persistence.WorkflowRevisionRepository
import java.time.Duration
import java.util.UUID

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
    @Autowired private lateinit var blobIndex: BlobIndexRepository
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

        val oneNode = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(Node(id = "only", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "Only"))),
            connections = emptyList(),
        )
        workflowService.updateGraph(versionId, oneNode)

        val version = workflowService.createVersion(workflowId, "v1.0")
        assertEquals("v1.0", version.tag)

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

        val restored = workflowService.restoreVersion(workflowId, version.id.toLong())
        assertEquals(1, restored.nodes.size, "после отката должен остаться один узел")
        assertEquals("only", restored.nodes.first().id)

        val nextRevAfter = revisions.nextRevisionNumber(workflowId)
        assertEquals(nextRevBefore + 1, nextRevAfter, "откат должен создавать новую ревизию (append-only)")

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

    @Test
    fun `run with unknown start node fails with Invalid start node diagnostics`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "badstart-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(Node(id = "real", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "Real"))),
                connections = emptyList(),
            ),
        )

        val runId = runEnqueueService.enqueue(workflowId, objectMapper.readTree("[]"), startNodeId = "ghost")
        val finished = waitUntilFinished(runId)
        assertEquals("failed", finished.status)
        val output = finished.outputJson?.let { objectMapper.readTree(it) }
        assertNotNull(output, "output должен содержать диагностику")
        assertTrue(output!!.get("error").asText().contains("Invalid start node")) {
            "ожидали 'Invalid start node', получили: $output"
        }
        assertTrue(nodeRuns.listByWorkflowRun(runId).isEmpty(), "при неверной стартовой ноде ноды не создаются")
    }

    @Test
    fun `interactive debug session steps through nodes to done and closes`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "dbgsess-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(
                    Node(id = "first", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "First")),
                    Node(id = "second", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "Second")),
                ),
                connections = listOf(Connection(id = "e", source = "first", target = "second")),
            ),
        )

        val session = debugSessions.start(workflowId, objectMapper.readTree("[1,2,3]"))
        assertEquals("ready", session.status)
        assertTrue(session.ready.contains("first"), "первой готова стартовая нода")

        val afterStep = debugSessions.step(session.sessionId)
        assertTrue(afterStep.completed.contains("first"))
        val done = debugSessions.runToEnd(session.sessionId)
        assertEquals("done", done.status)
        assertTrue(done.completed.containsAll(listOf("first", "second")), "обе ноды должны завершиться: ${done.completed}")

        assertEquals("done", debugSessions.get(session.sessionId).status)
        debugSessions.close(session.sessionId)
        assertThrows(NotFoundException::class.java) { debugSessions.get(session.sessionId) }
    }

    @Test
    fun `debug session marks node failed when its executor throws`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "dbg-fail-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(
                    Node(id = "bad", type = "http", position = Position(0.0, 0.0), data = NodeData(label = "Bad", config = objectMapper.readTree("{}"))),
                ),
                connections = emptyList(),
            ),
        )

        val session = debugSessions.start(workflowId, objectMapper.readTree("{}"))
        val after = debugSessions.step(session.sessionId)
        assertEquals("failed", after.status, "сессия должна перейти в статус failed после падения ноды")
        assertEquals(1, after.failed.size)
        assertEquals("bad", after.failed.first().nodeId)
        assertNotNull(after.failed.first().message)
    }

    @Test
    fun `debug session pick-mode skips the non-chosen branch`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "dbg-pick-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        val splitConfig = objectMapper.readTree(
            """
            {"mode":"pick","strategy":"attribute",
             "variants":[{"key":"A","label":"A","weight":1},{"key":"B","label":"B","weight":1}],
             "rules":[{"variant":"A","field":"country","op":"eq","value":"RU"}],
             "defaultVariant":"B"}
            """.trimIndent(),
        )
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(
                    Node(id = "split", type = "branch.split", position = Position(0.0, 0.0), data = NodeData(label = "S", config = splitConfig)),
                    Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "A")),
                    Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0), data = NodeData(label = "B")),
                ),
                connections = listOf(
                    Connection(id = "ea", source = "split", target = "passA", variant = "A"),
                    Connection(id = "eb", source = "split", target = "passB", variant = "B"),
                ),
            ),
        )

        val session = debugSessions.start(workflowId, objectMapper.readTree("""[{"country":"RU"}]"""))
        val done = debugSessions.runToEnd(session.sessionId)
        assertEquals("done", done.status)
        assertTrue(done.completed.contains("passA"), "выбранная ветка A должна исполниться: ${done.completed}")
        assertTrue(done.skipped.contains("passB"), "невыбранная ветка B должна быть пропущена: ${done.skipped}")
    }

    @Test
    fun `listByWorkflowRunIds returns empty map for empty input`() {
        assertEquals(emptyMap<Long, List<Any>>(), nodeRuns.listByWorkflowRunIds(emptyList()))
    }

    @Test
    fun `blob index insert is idempotent and exists reflects state`() {
        val hash = "test-" + UUID.randomUUID().toString().replace("-", "")
        assertFalse(blobIndex.exists(hash), "несуществующий хеш не должен находиться")

        blobIndex.insertIfMissing(contentHash = hash, s3Key = "blobs/$hash", sizeBytes = 123L)
        assertTrue(blobIndex.exists(hash), "после вставки хеш должен находиться")

        blobIndex.insertIfMissing(contentHash = hash, s3Key = "blobs/$hash", sizeBytes = 123L, storageClass = "STANDARD")
        assertTrue(blobIndex.exists(hash), "идемпотентная вставка не должна ломать индекс")
    }

    @Test
    fun `unknown node type marks the node failed with Unsupported node type`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "unknown-type-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(Node(id = "mystery", type = "mystery.type", position = Position(0.0, 0.0), data = NodeData(label = "M"))),
                connections = emptyList(),
            ),
        )

        val runId = runEnqueueService.enqueue(workflowId, objectMapper.readTree("[]"))
        val finished = waitUntilFinished(runId)
        assertEquals("failed", finished.status)
        val nodeRun = nodeRuns.listByWorkflowRun(runId).single()
        assertEquals("failed", nodeRun.status)
        assertTrue(nodeRun.errorMessage!!.contains("Unsupported node type")) { "was: ${nodeRun.errorMessage}" }
    }

    @Test
    fun `upstream node failure skips downstream node with root-cause diagnostic`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "skip-prop-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(
                    Node(id = "bad", type = "http", position = Position(0.0, 0.0), data = NodeData(label = "Bad", config = objectMapper.readTree("{}"))),
                    Node(id = "down", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "Down")),
                ),
                connections = listOf(Connection(id = "e", source = "bad", target = "down")),
            ),
        )

        val runId = runEnqueueService.enqueue(workflowId, objectMapper.readTree("[]"))
        val finished = waitUntilFinished(runId)
        assertEquals("failed", finished.status)
        val byId = nodeRuns.listByWorkflowRun(runId).associateBy { it.nodeId }
        assertEquals("failed", byId.getValue("bad").status)
        assertEquals("skipped", byId.getValue("down").status, "зависимая нода должна быть skipped")
        assertTrue(byId.getValue("down").errorMessage!!.startsWith("Dependency failed:")) {
            "ожидали корневую причину, получили: ${byId.getValue("down").errorMessage}"
        }
    }

    @Test
    fun `manual run records trigger type manual and node type`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "ttype-${UUID.randomUUID()}"))
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
        waitUntilFinished(runId)

        assertEquals("manual", workflowRuns.findById(runId)!!.triggerType)
        assertEquals("dataflow.foreach", nodeRuns.listByWorkflowRun(runId).single().nodeType)
    }

    @Test
    fun `debug start with unknown start node throws BadRequest`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "dbg-badstart-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(Node(id = "real", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "R"))),
                connections = emptyList(),
            ),
        )
        assertThrows(BadRequestException::class.java) {
            debugSessions.start(workflowId, objectMapper.readTree("[]"), startNodeId = "ghost")
        }
    }

    @Test
    fun `debug step with non-ready node throws BadRequest`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "dbg-step-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(
                    Node(id = "first", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "First")),
                    Node(id = "second", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "Second")),
                ),
                connections = listOf(Connection(id = "e", source = "first", target = "second")),
            ),
        )
        val session = debugSessions.start(workflowId, objectMapper.readTree("[1,2,3]"))
        assertThrows(BadRequestException::class.java) {
            debugSessions.step(session.sessionId, "second")
        }
    }

    @Test
    fun `debugRunNode with unsupported node type throws BadRequest and leaves no orphan run`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "dbg-badtype-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        workflowService.updateGraph(
            versionId,
            WorkflowGraph(
                versionId = versionId.toString(),
                nodes = listOf(Node(id = "mystery", type = "mystery.type", position = Position(0.0, 0.0), data = NodeData(label = "M"))),
                connections = emptyList(),
            ),
        )
        assertThrows(BadRequestException::class.java) {
            debugSessions.debugRunNode(workflowId, "mystery", objectMapper.readTree("{}"))
        }
        assertTrue(workflowRuns.listByWorkflow(workflowId).isEmpty(), "при неизвестном типе ноды run не должен создаваться")
    }

    @Test
    fun `updateSnapshot changes name and description`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "snap-upd-${UUID.randomUUID()}"))
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
        val snap = workflowService.createSnapshot(workflowId, "before", "old desc")
        val updated = workflowService.updateSnapshot(workflowId, snap.id.toLong(), "after", "new desc")
        assertEquals("after", updated.name)
        assertEquals("new desc", updated.description)
        assertEquals("after", workflowService.listSnapshots(workflowId).single().name)
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
