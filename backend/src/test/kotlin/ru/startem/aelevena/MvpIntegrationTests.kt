package ru.startem.aelevena

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.api.dto.WorkflowMetaUpdate
import ru.startem.aelevena.blob.BlobService
import ru.startem.aelevena.config.S3Properties
import ru.startem.aelevena.executor.NodeExecutor
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.run.RunQueryService
import ru.startem.aelevena.run.WorkflowRunRepository
import ru.startem.aelevena.workflow.WorkflowService
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import java.time.Duration
import java.util.UUID

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(MvpIntegrationTests.ContainersConfig::class)
class MvpIntegrationTests {

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
            // В Kotlin companion object без @JvmStatic поле minio не находится Testcontainers JUnit-расширением,
            // поэтому стартуем контейнер вручную до того, как Spring начнёт читать app.s3.endpoint.
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
    @Autowired private lateinit var jdbc: NamedParameterJdbcTemplate
    @Autowired private lateinit var blobService: BlobService
    @Autowired private lateinit var s3: S3Client
    @Autowired private lateinit var s3Props: S3Properties
    @Autowired private lateinit var workflowRuns: WorkflowRunRepository
    @Autowired private lateinit var runQueryService: RunQueryService
    @Autowired private lateinit var objectMapper: ObjectMapper

    @BeforeAll
    fun ensureBucket() {
        s3.createBucket(CreateBucketRequest.builder().bucket(s3Props.bucket).build())
    }

    @Test
    fun `graph update creates revisions and CAS dedupes configs`() {
        val created = workflowService.createWorkflow(ru.startem.aelevena.api.dto.WorkflowCreateRequest(name = "test"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val config = objectMapper.readTree("""{"x":1,"y":2}""")
        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(
                    id = "n1",
                    type = "stub",
                    position = Position(1.0, 2.0),
                    data = NodeData(label = "stub", config = config),
                )
            ),
            connections = emptyList(),
        )

        workflowService.updateGraph(versionId, graph)
        workflowService.updateGraph(versionId, graph)

        val revCount = jdbc.queryForObject(
            "select count(*) from workflow_revision where workflow_id = :wid",
            mapOf("wid" to workflowId),
            Long::class.java,
        )
        assertTrue(revCount != null && revCount >= 3L)

        val blobCount = jdbc.queryForObject(
            "select count(*) from blob_index",
            emptyMap<String, Any>(),
            Long::class.java,
        )
        assertEquals(1L, blobCount)

        val hash = blobService.putJsonIfMissing(objectMapper.convertValue(config, Any::class.java))
        assertNotNull(blobService.getJsonTree(hash))

        val updatedMeta = workflowService.updateWorkflowMeta(workflowId, WorkflowMetaUpdate(name = "renamed"))
        assertEquals("renamed", updatedMeta.name)
    }

    @Test
    fun `enqueue run executes stub node and persists output`() {
        val created = workflowService.createWorkflow(ru.startem.aelevena.api.dto.WorkflowCreateRequest(name = "run-test"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val graph = WorkflowGraph(
            versionId = versionId.toString(),
            nodes = listOf(
                Node(
                    id = "n1",
                    type = "stub",
                    position = Position(1.0, 2.0),
                    data = NodeData(label = "stub", config = objectMapper.readTree("""{"hello":"cfg"}""")),
                )
            ),
            connections = emptyList(),
        )
        workflowService.updateGraph(versionId, graph)

        val runId = runEnqueueService.enqueue(workflowId, objectMapper.readTree("""{"foo":"bar"}"""))

        val finished = waitUntilFinished(runId, Duration.ofSeconds(10))
        assertTrue(finished.status == "success" || finished.status == "failed")
        assertNotNull(finished.outputJson)

        // Regression: WorkflowRun DTO теперь должен отдавать ноды (раньше UI получал пустой список,
        // что и было причиной "0 инфы" в панели «Запуски»).
        val dto = runQueryService.getWorkflowRun(runId)
        assertEquals(1, dto.nodes.size)
        val nodeRun = dto.nodes.first()
        assertEquals("n1", nodeRun.nodeId)
        assertEquals("success", nodeRun.status)
        assertNotNull(nodeRun.input)
        assertNotNull(nodeRun.output)
        assertNotNull(dto.durationMs)
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