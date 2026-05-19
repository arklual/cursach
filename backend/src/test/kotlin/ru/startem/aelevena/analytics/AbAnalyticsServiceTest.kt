package ru.startem.aelevena.analytics

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
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
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.run.WorkflowRunRepository
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Duration
import java.util.UUID

@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = ["app.seed.demo-workflows-enabled=false"],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ru.startem.aelevena.MvpIntegrationTests.ContainersConfig::class)
class AbAnalyticsServiceTest {

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
    @Autowired private lateinit var workflowRunRepository: WorkflowRunRepository
    @Autowired private lateinit var service: AbAnalyticsService
    @Autowired private lateinit var mapper: ObjectMapper

    @Test
    fun `compute returns empty variants when no runs`() {
        val (workflowId, abNodeId) = createWorkflowWithPickAb()
        val response = service.compute(workflowId, abNodeId)
        assertEquals(0, response.totalRuns)
        assertEquals(0, response.excludedNoVariant)
        assertEquals(2, response.variants.size)
        assertEquals(0, response.variants[0].runs)
    }

    @Test
    fun `compute aggregates pick-mode traffic and conversion`() {
        val (workflowId, abNodeId) = createWorkflowWithPickAb()

        repeat(6) {
            val runId = runEnqueueService.enqueue(workflowId, mapper.readTree("""[{"country":"RU"}]"""))
            waitForFinish(runId)
        }
        repeat(4) {
            val runId = runEnqueueService.enqueue(workflowId, mapper.readTree("""[{"country":"US"}]"""))
            waitForFinish(runId)
        }

        val response = service.compute(workflowId, abNodeId)
        assertEquals(10, response.totalRuns)
        assertEquals(0, response.excludedNoVariant)
        assertEquals(2, response.variants.size)

        val rowA = response.variants.first { it.key == "A" }
        val rowB = response.variants.first { it.key == "B" }
        assertEquals(6, rowA.runs)
        assertEquals(4, rowB.runs)
        assertEquals(true, rowA.isBaseline)
        assertEquals(false, rowB.isBaseline)
        assertNotNull(rowA.conversionPct)
        assertNotNull(rowB.conversionPct)
        assertEquals(100.0, rowA.conversionPct!!, 0.01)
        assertEquals(100.0, rowB.conversionPct!!, 0.01)
        assertEquals(0.0, rowB.liftVsBaseline!!, 0.01)
    }

    @Test
    fun `compute returns null conversion for split-mode`() {
        val (workflowId, abNodeId) = createWorkflowWithSplitAb()

        val input = mapper.readTree("""[{"u":1},{"u":2},{"u":3},{"u":4},{"u":5},{"u":6},{"u":7},{"u":8}]""")
        val runId = runEnqueueService.enqueue(workflowId, input)
        waitForFinish(runId)

        val response = service.compute(workflowId, abNodeId)
        assertEquals("split", response.mode)
        assertEquals(1, response.totalRuns)
        response.variants.forEach { v ->
            assertEquals(null, v.conversionPct)
            assertEquals(null, v.pValue)
        }
        assertEquals(8, response.variants.sumOf { it.trafficCount })
    }

    private fun waitForFinish(runId: Long, timeoutMs: Long = 10_000) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val row = workflowRunRepository.findById(runId) ?: error("run $runId not found")
            if (row.status == "success" || row.status == "failed") return
            Thread.sleep(50)
        }
        error("run $runId did not finish within ${timeoutMs}ms")
    }

    private fun createWorkflowWithPickAb(): Pair<UUID, String> {
        val created = workflowService.createWorkflow(
            WorkflowCreateRequest(name = "ab-analytics-test-${UUID.randomUUID()}")
        )
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = mapper.readTree(
            """
            {
              "mode": "pick",
              "strategy": "attribute",
              "variants": [
                {"key": "A", "label": "RU branch",    "weight": 1},
                {"key": "B", "label": "Other branch", "weight": 1}
              ],
              "rules": [
                {"variant": "A", "field": "country", "op": "eq", "value": "RU"}
              ],
              "defaultVariant": "B"
            }
            """.trimIndent()
        )
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0),
                    data = NodeData(label = "Pass A")),
                Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0),
                    data = NodeData(label = "Pass B")),
                Node(id = "merge", type = "branch.merge", position = Position(2.0, 0.5),
                    data = NodeData(label = "Merge")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
                Connection(id = "e-split-b", source = "split", target = "passB", variant = "B"),
                Connection(id = "e-a-merge", source = "passA", target = "merge"),
                Connection(id = "e-b-merge", source = "passB", target = "merge"),
            ),
        )
        workflowService.updateGraph(versionId, graph)
        return workflowId to "split"
    }

    private fun createWorkflowWithSplitAb(): Pair<UUID, String> {
        val created = workflowService.createWorkflow(
            WorkflowCreateRequest(name = "ab-split-analytics-${UUID.randomUUID()}")
        )
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = mapper.readTree(
            """
            {
              "mode": "split",
              "strategy": "random",
              "seed": 42,
              "variants": [
                {"key": "A", "label": "Branch A", "weight": 1},
                {"key": "B", "label": "Branch B", "weight": 1}
              ]
            }
            """.trimIndent()
        )
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0),
                    data = NodeData(label = "Pass A")),
                Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0),
                    data = NodeData(label = "Pass B")),
                Node(id = "merge", type = "branch.merge", position = Position(2.0, 0.5),
                    data = NodeData(label = "Merge")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
                Connection(id = "e-split-b", source = "split", target = "passB", variant = "B"),
                Connection(id = "e-a-merge", source = "passA", target = "merge"),
                Connection(id = "e-b-merge", source = "passB", target = "merge"),
            ),
        )
        workflowService.updateGraph(versionId, graph)
        return workflowId to "split"
    }
}
