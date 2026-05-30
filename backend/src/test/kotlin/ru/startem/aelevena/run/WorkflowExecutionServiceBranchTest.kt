package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
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
class WorkflowExecutionServiceBranchTest {

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
    @Autowired private lateinit var objectMapper: ObjectMapper

    @Test
    fun `split-mode distributes all items and merge collects them with variant tags`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "branch-split-test-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = objectMapper.readTree(
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
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0), data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "Pass A")),
                Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0), data = NodeData(label = "Pass B")),
                Node(id = "merge", type = "branch.merge", position = Position(2.0, 0.5), data = NodeData(label = "Merge")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
                Connection(id = "e-split-b", source = "split", target = "passB", variant = "B"),
                Connection(id = "e-a-merge", source = "passA", target = "merge"),
                Connection(id = "e-b-merge", source = "passB", target = "merge"),
            ),
        )
        workflowService.updateGraph(versionId, graph)

        val input = objectMapper.readTree(
            """[{"id":1},{"id":2},{"id":3},{"id":4},{"id":5},{"id":6},{"id":7},{"id":8}]"""
        )
        val runId = runEnqueueService.enqueue(workflowId, input)

        val finished = waitUntilFinished(runId, Duration.ofSeconds(30))
        assertEquals("success", finished.status, "Run должен завершиться success")

        val nodeRunList = nodeRuns.listByWorkflowRun(runId)
        val byNodeId = nodeRunList.associateBy { it.nodeId }

        listOf("split", "passA", "passB", "merge").forEach { nodeId ->
            val nr = byNodeId[nodeId]
            assertNotNull(nr, "NodeRun для $nodeId должен существовать")
            assertEquals("success", nr!!.status, "Узел $nodeId должен быть success, но был ${nr.status}")
        }

        val mergeOutput = byNodeId["merge"]!!.outputJson?.let { objectMapper.readTree(it) }
        assertNotNull(mergeOutput, "merge output не должен быть null")
        assertTrue(mergeOutput!!.isArray, "merge output должен быть массивом")
        assertEquals(8, mergeOutput.size(), "merge должен собрать все 8 элементов, а не ${mergeOutput.size()}")

        val variants = mutableSetOf<String>()
        for (item in mergeOutput) {
            assertTrue(item.has("_variant"), "Элемент $item должен иметь поле _variant")
            val v = item.get("_variant").asText()
            assertTrue(v == "A" || v == "B", "_variant должен быть A или B, а не '$v'")
            variants.add(v)
        }
        assertTrue(variants.isNotEmpty(), "Набор вариантов не должен быть пустым")
    }

    @Test
    fun `pick-mode skips non-chosen branch and merge succeeds with only active branch items`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "branch-pick-test-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = objectMapper.readTree(
            """
            {
              "mode": "pick",
              "strategy": "attribute",
              "variants": [
                {"key": "A", "label": "RU Branch", "weight": 1},
                {"key": "B", "label": "Other Branch", "weight": 1}
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
                Node(id = "split", type = "branch.split", position = Position(0.0, 0.0), data = NodeData(label = "Split", config = splitConfig)),
                Node(id = "passA", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "Pass A")),
                Node(id = "passB", type = "dataflow.foreach", position = Position(1.0, 1.0), data = NodeData(label = "Pass B")),
                Node(id = "merge", type = "branch.merge", position = Position(2.0, 0.5), data = NodeData(label = "Merge")),
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
                Connection(id = "e-split-b", source = "split", target = "passB", variant = "B"),
                Connection(id = "e-a-merge", source = "passA", target = "merge"),
                Connection(id = "e-b-merge", source = "passB", target = "merge"),
            ),
        )
        workflowService.updateGraph(versionId, graph)

        val input = objectMapper.readTree("""[{"country":"RU"}]""")
        val runId = runEnqueueService.enqueue(workflowId, input)

        val finished = waitUntilFinished(runId, Duration.ofSeconds(30))
        assertEquals("success", finished.status, "Run должен завершиться success")

        val nodeRunList = nodeRuns.listByWorkflowRun(runId)
        val byNodeId = nodeRunList.associateBy { it.nodeId }

        val splitNr = byNodeId["split"]
        assertNotNull(splitNr, "NodeRun для split должен существовать")
        assertEquals("success", splitNr!!.status, "split должен быть success")

        val passANr = byNodeId["passA"]
        assertNotNull(passANr, "NodeRun для passA должен существовать")
        assertEquals("success", passANr!!.status, "passA должен быть success, так как chosen=A")

        val passBNr = byNodeId["passB"]
        assertNotNull(passBNr, "NodeRun для passB должен существовать")
        assertEquals("skipped", passBNr!!.status, "passB должен быть skipped, но был ${passBNr.status}")

        val mergeNr = byNodeId["merge"]
        assertNotNull(mergeNr, "NodeRun для merge должен существовать")
        assertEquals("success", mergeNr!!.status, "merge должен быть success")

        val mergeOutput = mergeNr.outputJson?.let { objectMapper.readTree(it) }
        assertNotNull(mergeOutput, "merge output не должен быть null")
        assertTrue(mergeOutput!!.isArray, "merge output должен быть массивом")
        assertTrue(mergeOutput.size() > 0, "merge output не должен быть пустым (ветка A активна)")

        for (item in mergeOutput) {
            if (item.has("country")) {
                assertEquals("RU", item.get("country").asText(), "В merge output должны быть только элементы из ветки A (country=RU)")
            }
        }
    }

    @Test
    fun `saveGraph бросает 400 если split edge без variant`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "validation-no-variant-${UUID.randomUUID()}"))
        val versionId = created.graph.versionId.toLong()
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(
                    id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(
                        label = "S", config = objectMapper.readTree(
                            """{"mode":"split","strategy":"random","variants":[{"key":"A","label":"A","weight":100}]}"""
                        )
                    )
                ),
                Node(
                    id = "pass", type = "dataflow.foreach", position = Position(100.0, 0.0),
                    data = NodeData(label = "P", config = null)
                ),
            ),
            connections = listOf(
                Connection(id = "e1", source = "split", target = "pass"),
            )
        )
        org.junit.jupiter.api.assertThrows<BadRequestException> { workflowService.updateGraph(versionId, graph) }
    }

    @Test
    fun `saveGraph бросает 400 если hash без userIdField`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "validation-no-uid-${UUID.randomUUID()}"))
        val versionId = created.graph.versionId.toLong()
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(
                    id = "split", type = "branch.split", position = Position(0.0, 0.0),
                    data = NodeData(
                        label = "S", config = objectMapper.readTree(
                            """{"mode":"split","strategy":"hash","variants":[{"key":"A","label":"A","weight":100}]}"""
                        )
                    )
                ),
            ),
            connections = emptyList()
        )
        org.junit.jupiter.api.assertThrows<BadRequestException> { workflowService.updateGraph(versionId, graph) }
    }

    private fun waitUntilFinished(runId: Long, timeout: Duration): WorkflowRunRepository.WorkflowRunRow {
        val deadline = System.currentTimeMillis() + timeout.toMillis()
        while (System.currentTimeMillis() < deadline) {
            val row = workflowRuns.findById(runId)
            if (row != null && row.status != "queued" && row.status != "running") {
                return row
            }
            Thread.sleep(100)
        }
        val last = workflowRuns.findById(runId) ?: throw IllegalStateException("Run not found after timeout")
        throw IllegalStateException("Run $runId did not finish in ${timeout.seconds}s (last status: ${last.status})")
    }
}
