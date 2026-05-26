package ru.startem.aelevena.run

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Duration
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Regression: до сплита executor-пулов одновременные runs приводили к starvation:
 * orchestrator-таски занимали все 4 слота и блокировались на `.join()` ожидая ноды,
 * для которых уже не было свободных потоков. Часть runs так и оставалась в `queued`/`running`
 * навсегда.
 *
 * Тест поднимает N параллельных runs одного workflow (только cpu/JSON-ноды, без Docker),
 * убеждается что все они дошли до status=success в разумный срок.
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = [
        "app.seed.demo-workflows-enabled=false",
        "app.execution.orchestrator-pool-size=2",
        "app.execution.node-pool-min=4",
        "app.execution.node-pool-max=16",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ru.startem.aelevena.MvpIntegrationTests.ContainersConfig::class)
class WorkflowExecutionConcurrencyTest {

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
    @Autowired private lateinit var objectMapper: ObjectMapper

    @Test
    fun `parallel runs of same workflow all complete (no orchestrator starvation)`() {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "concurrency-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(id = "a", type = "dataflow.foreach", position = Position(0.0, 0.0), data = NodeData(label = "a")),
                Node(id = "b", type = "dataflow.foreach", position = Position(1.0, 0.0), data = NodeData(label = "b")),
                Node(id = "c", type = "dataflow.foreach", position = Position(2.0, 0.0), data = NodeData(label = "c")),
            ),
            connections = listOf(
                Connection(id = "e1", source = "a", target = "b"),
                Connection(id = "e2", source = "b", target = "c"),
            ),
        )
        workflowService.updateGraph(versionId, graph)

        val input = objectMapper.readTree("""[{"x":1},{"x":2},{"x":3}]""")
        val launcher = Executors.newFixedThreadPool(8)
        val runIds = mutableListOf<Long>()
        val parallelism = 30
        try {
            val futures = (1..parallelism).map {
                launcher.submit<Long> {
                    runEnqueueService.enqueue(workflowId, input)
                }
            }
            futures.forEach { runIds.add(it.get(15, TimeUnit.SECONDS)) }
        } finally {
            launcher.shutdown()
        }
        assertEquals(parallelism, runIds.size, "All runs should have been enqueued")

        val deadline = System.currentTimeMillis() + 60_000L
        val finished = mutableSetOf<Long>()
        while (System.currentTimeMillis() < deadline && finished.size < runIds.size) {
            runIds.forEach { id ->
                if (id !in finished) {
                    val row = workflowRuns.findById(id)
                    if (row != null && row.status != "queued" && row.status != "running") {
                        finished.add(id)
                    }
                }
            }
            if (finished.size < runIds.size) Thread.sleep(200)
        }

        val stuck = runIds - finished
        assertTrue(
            stuck.isEmpty(),
            "Эти runs зависли в очереди — это и есть тот баг, который мы чиним: $stuck " +
                "(статусы: ${stuck.map { it to workflowRuns.findById(it)?.status }})",
        )
        val statuses = runIds.map { workflowRuns.findById(it)!!.status }
        assertTrue(statuses.all { it == "success" }, "Все runs должны быть success, было: $statuses")
    }
}
