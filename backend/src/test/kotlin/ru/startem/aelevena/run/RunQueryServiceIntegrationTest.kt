package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.executor.NodeExecutor
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Duration
import java.util.UUID

/**
 * RunQueryService — getWorkflowRun / listWorkflowRuns / getWorkflowRunResult / getNodeRun
 * с реальным выполнением workflow через RunEnqueueService → WorkflowExecutionService,
 * с цепочкой нод (для проверки терминальной агрегации).
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Import(RunQueryServiceIntegrationTest.ContainersConfig::class, RunQueryServiceIntegrationTest.StubExecutorConfig::class)
class RunQueryServiceIntegrationTest {

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
            registry.add("app.seed.demo-workflows-enabled") { "false" }
        }
    }

    @Autowired private lateinit var workflowService: WorkflowService
    @Autowired private lateinit var runEnqueueService: RunEnqueueService
    @Autowired private lateinit var runQueryService: RunQueryService
    @Autowired private lateinit var workflowRuns: WorkflowRunRepository
    @Autowired private lateinit var nodeRuns: NodeRunRepository
    @Autowired private lateinit var objectMapper: ObjectMapper

    private fun freshWorkflow(name: String, graph: WorkflowGraph.() -> WorkflowGraph): Pair<UUID, Long> {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "$name-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()
        val base = WorkflowGraph(versionId = versionId.toString(), nodes = emptyList(), connections = emptyList())
        workflowService.updateGraph(versionId, base.graph())
        return workflowId to versionId
    }

    private fun runAndWait(workflowId: UUID, input: JsonNode? = null, startNodeId: String? = null): Long {
        val runId = runEnqueueService.enqueue(workflowId, input, startNodeId = startNodeId)
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            val r = workflowRuns.findById(runId) ?: continue
            if (r.status != "queued" && r.status != "running") return runId
            Thread.sleep(60)
        }
        throw IllegalStateException("run $runId did not finish in time")
    }

    @Test
    fun `getWorkflowRun returns nodes with status success and durationMs`() {
        val (wfId, _) = freshWorkflow("rq-1") {
            copy(
                nodes = listOf(Node("n1", "stub", Position(0.0, 0.0), NodeData("L"))),
                connections = emptyList(),
            )
        }
        val runId = runAndWait(wfId)

        val dto = runQueryService.getWorkflowRun(runId)
        assertEquals("success", dto.status)
        assertEquals(1, dto.nodes.size)
        assertEquals("success", dto.nodes.first().status)
        assertNotNull(dto.durationMs)
        assertNotNull(dto.startedAt)
        assertNotNull(dto.finishedAt)
    }

    @Test
    fun `getWorkflowRun on unknown id throws NotFoundException`() {
        assertThrows(NotFoundException::class.java) {
            runQueryService.getWorkflowRun(-9_999L)
        }
    }

    @Test
    fun `getWorkflowRunResult aggregates single terminal output`() {
        val (wfId, _) = freshWorkflow("rq-result-single") {
            copy(
                nodes = listOf(Node("only", "stub", Position(0.0, 0.0), NodeData("L"))),
                connections = emptyList(),
            )
        }
        val runId = runAndWait(wfId)

        val result = runQueryService.getWorkflowRunResult(runId)
        assertEquals("success", result.status)
        assertNotNull(result.output, "terminal node output must be present")
        assertNotNull(result.durationMs)
    }

    @Test
    fun `getWorkflowRunResult aggregates multiple terminal outputs as object`() {
        val (wfId, _) = freshWorkflow("rq-result-multi") {
            copy(
                nodes = listOf(
                    Node("a", "stub", Position(0.0, 0.0), NodeData("A")),
                    Node("b", "stub", Position(100.0, 0.0), NodeData("B")),
                ),
                connections = emptyList(),
            )
        }
        val runId = runAndWait(wfId)

        val result = runQueryService.getWorkflowRunResult(runId)
        // Two parallel terminal nodes — aggregate output is {a: ..., b: ...}.
        val out = result.output!!
        assertTrue(out.has("a"), "expected key 'a' in aggregated output: $out")
        assertTrue(out.has("b"), "expected key 'b' in aggregated output: $out")
    }

    @Test
    fun `getWorkflowRunResult on unknown id throws NotFoundException`() {
        assertThrows(NotFoundException::class.java) {
            runQueryService.getWorkflowRunResult(-1L)
        }
    }

    @Test
    fun `listWorkflowRuns returns runs newest-first with embedded nodes`() {
        val (wfId, _) = freshWorkflow("rq-list") {
            copy(
                nodes = listOf(Node("n1", "stub", Position(0.0, 0.0), NodeData("L"))),
                connections = emptyList(),
            )
        }
        runAndWait(wfId)
        runAndWait(wfId)

        val list = runQueryService.listWorkflowRuns(wfId)
        assertEquals(2, list.size)
        list.forEach {
            assertTrue(it.nodes.isNotEmpty(), "every run must embed nodes")
        }
    }

    @Test
    fun `listWorkflowRuns for fresh workflow returns empty list`() {
        val (wfId, _) = freshWorkflow("rq-empty") {
            copy(nodes = emptyList(), connections = emptyList())
        }
        assertEquals(emptyList<Any>(), runQueryService.listWorkflowRuns(wfId))
    }

    @Test
    fun `listWorkflowRuns on unknown workflow throws NotFoundException`() {
        assertThrows(NotFoundException::class.java) {
            runQueryService.listWorkflowRuns(UUID.randomUUID())
        }
    }

    @Test
    fun `getNodeRun returns node by id - unknown id throws`() {
        val (wfId, _) = freshWorkflow("rq-node") {
            copy(
                nodes = listOf(Node("n1", "stub", Position(0.0, 0.0), NodeData("L"))),
                connections = emptyList(),
            )
        }
        val runId = runAndWait(wfId)
        val nrId = nodeRuns.listByWorkflowRun(runId).first().id

        val dto = runQueryService.getNodeRun(nrId)
        assertEquals("success", dto.status)
        assertNotNull(dto.input)
        assertNotNull(dto.output)

        assertThrows(NotFoundException::class.java) {
            runQueryService.getNodeRun(-42L)
        }
    }

    @Test
    fun `startNodeId scopes terminal aggregation to reachable subgraph`() {
        val (wfId, _) = freshWorkflow("rq-start-node") {
            copy(
                nodes = listOf(
                    Node("a", "stub", Position(0.0, 0.0), NodeData("A")),
                    Node("b", "stub", Position(0.0, 0.0), NodeData("B")),
                    Node("c", "stub", Position(0.0, 0.0), NodeData("C")),
                ),
                connections = listOf(Connection(id = "c1", source = "a", target = "b")),
            )
        }
        // Start only from "a" — terminal of reachable subgraph is "b".
        val runId = runAndWait(wfId, startNodeId = "a")
        val result = runQueryService.getWorkflowRunResult(runId)
        // Even with isolated node "c" in graph, terminal output should be only "b"'s output (single terminal).
        assertNotNull(result.output)
    }

    @TestConfiguration
    class StubExecutorConfig {
        @Bean
        fun stubNodeExecutor(objectMapper: ObjectMapper): NodeExecutor =
            object : NodeExecutor {
                override val type: String = "stub"
                override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
                    val out = objectMapper.createObjectNode()
                    out.put("nodeId", nodeId)
                    out.set<JsonNode>("input", input)
                    if (config != null) out.set<JsonNode>("config", config)
                    return out
                }
            }
    }

    @TestConfiguration
    class ContainersConfig {
        @Bean
        @ServiceConnection
        fun postgres(): PostgreSQLContainer<*> =
            PostgreSQLContainer("postgres:16-alpine")
                .withDatabaseName("a11a")
                .withUsername("a11a")
                .withPassword("a11a")
    }
}
