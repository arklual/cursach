package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
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
import java.time.Duration
import java.util.UUID

@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.MOCK,
    properties = ["app.seed.demo-workflows-enabled=false"],
)
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ru.startem.aelevena.MvpIntegrationTests.ContainersConfig::class)
class AbAnalyticsControllerTest {

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

    @Autowired private lateinit var mockMvc: MockMvc
    @Autowired private lateinit var workflowService: WorkflowService
    @Autowired private lateinit var mapper: ObjectMapper

    @Test
    fun `returns 200 with empty variants when no runs`() {
        val (workflowId, abNodeId) = createWorkflowWithAb()
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId={n}", workflowId, abNodeId))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.abNodeId").value(abNodeId))
            .andExpect(jsonPath("$.totalRuns").value(0))
            .andExpect(jsonPath("$.variants.length()").value(2))
    }

    @Test
    fun `returns 404 when workflow not found`() {
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId=split", UUID.randomUUID()))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `returns 404 when node not found in workflow`() {
        val (workflowId, _) = createWorkflowWithAb()
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId=does-not-exist", workflowId))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `returns 400 when node is not ab`() {
        val (workflowId, _) = createWorkflowWithAb()
        mockMvc.perform(get("/workflows/{id}/ab-analytics?abNodeId=passA", workflowId))
            .andExpect(status().isBadRequest)
    }

    private fun createWorkflowWithAb(): Pair<UUID, String> {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "ctrl-test-${UUID.randomUUID()}"))
        val workflowId = UUID.fromString(created.meta.id)
        val versionId = created.graph.versionId.toLong()

        val splitConfig = mapper.readTree(
            """
            {
              "mode": "pick",
              "strategy": "random",
              "userIdField": "u",
              "variants": [
                {"key": "A", "label": "Control",   "weight": 50},
                {"key": "B", "label": "Treatment", "weight": 50}
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
            ),
            connections = listOf(
                Connection(id = "e-split-a", source = "split", target = "passA", variant = "A"),
            ),
        )
        workflowService.updateGraph(versionId, graph)
        return workflowId to "split"
    }
}
