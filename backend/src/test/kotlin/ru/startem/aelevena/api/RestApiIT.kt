package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.executor.NodeExecutor
import java.time.Duration
import java.util.UUID

/**
 * End-to-end MockMvc для REST API: workflows, snapshots, runs, triggers, webhooks,
 * exception handler. Покрывает контроллеры + service edge-cases которые не цепляют
 * другие тесты.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@Import(RestApiIT.ContainersConfig::class, RestApiIT.StubExecutorConfig::class)
class RestApiIT {

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

    @Autowired private lateinit var mockMvc: MockMvc
    @Autowired private lateinit var mapper: ObjectMapper

    private fun createWorkflow(name: String = "rest-test-${UUID.randomUUID()}"): JsonNode {
        val res = mockMvc.perform(
            post("/workflows")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"$name","description":"d"}"""),
        ).andExpect(status().isCreated)
            .andReturn().response.contentAsString
        return mapper.readTree(res)
    }

    @Test
    fun `workflow CRUD round-trip`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        assertNotNull(id)

        mockMvc.perform(get("/workflows"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)

        mockMvc.perform(get("/workflows/$id"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.meta.id").value(id))

        mockMvc.perform(
            put("/workflows/$id")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"renamed"}"""),
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("renamed"))

        mockMvc.perform(delete("/workflows/$id"))
            .andExpect(status().isNoContent)

        mockMvc.perform(get("/workflows/$id"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `get unknown workflow returns 404`() {
        mockMvc.perform(get("/workflows/${UUID.randomUUID()}"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `delete unknown workflow returns 404`() {
        mockMvc.perform(delete("/workflows/${UUID.randomUUID()}"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `update meta on unknown returns 404`() {
        mockMvc.perform(
            put("/workflows/${UUID.randomUUID()}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"x"}"""),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `versions create + list`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()

        mockMvc.perform(post("/workflows/$id/versions"))
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").exists())

        mockMvc.perform(get("/workflows/$id/versions"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
            .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)))
    }

    @Test
    fun `versions list on unknown returns 404`() {
        mockMvc.perform(get("/workflows/${UUID.randomUUID()}/versions"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `update graph with branch_split missing variants is rejected`() {
        val wf = createWorkflow()
        val versionId = wf.get("graph").get("versionId").asText()
        val payload = """
            {
              "versionId": "$versionId",
              "nodes": [
                {"id":"s","type":"branch.split","position":{"x":0,"y":0},"data":{"label":"S","config":{}}}
              ],
              "connections": []
            }
        """.trimIndent()
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload),
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `update graph with duplicate node ids is rejected`() {
        val wf = createWorkflow()
        val versionId = wf.get("graph").get("versionId").asText()
        val payload = """
            {"versionId":"$versionId","nodes":[
                {"id":"x","type":"stub","position":{"x":0,"y":0},"data":{"label":"a"}},
                {"id":"x","type":"stub","position":{"x":0,"y":0},"data":{"label":"b"}}
            ],"connections":[]}
        """.trimIndent()
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload),
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `snapshot CRUD round-trip`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        val versionId = wf.get("graph").get("versionId").asText()

        // Lay down a real graph so the snapshot's restored revision isn't trivially empty.
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"versionId":"$versionId","nodes":[
                       {"id":"n1","type":"stub","position":{"x":0,"y":0},"data":{"label":"L"}}
                       ],"connections":[]}""",
                ),
        ).andExpect(status().isOk)

        val snap = mockMvc.perform(
            post("/workflows/$id/snapshots")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"v1","description":"d"}"""),
        ).andExpect(status().isCreated)
            .andReturn().response.contentAsString
        val snapId = mapper.readTree(snap).get("id").asText()

        mockMvc.perform(get("/workflows/$id/snapshots"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))

        mockMvc.perform(post("/workflows/$id/snapshots/$snapId/restore"))
            .andExpect(status().isOk)

        mockMvc.perform(delete("/workflows/$id/snapshots/$snapId"))
            .andExpect(status().isNoContent)

        mockMvc.perform(get("/workflows/$id/snapshots"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(0))
    }

    @Test
    fun `snapshot create rejects blank name`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        mockMvc.perform(
            post("/workflows/$id/snapshots")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":""}"""),
        ).andExpect(status().is4xxClientError)
    }

    @Test
    fun `snapshot operations on unknown workflow return 404`() {
        val randomId = UUID.randomUUID()
        mockMvc.perform(get("/workflows/$randomId/snapshots"))
            .andExpect(status().isNotFound)
        mockMvc.perform(delete("/workflows/$randomId/snapshots/1"))
            .andExpect(status().isNotFound)
        mockMvc.perform(post("/workflows/$randomId/snapshots/1/restore"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `delete snapshot from different workflow returns 404`() {
        val wfA = createWorkflow()
        val wfB = createWorkflow()
        val idA = wfA.get("meta").get("id").asText()
        val idB = wfB.get("meta").get("id").asText()

        val snap = mockMvc.perform(
            post("/workflows/$idA/snapshots")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"x"}"""),
        ).andExpect(status().isCreated)
            .andReturn().response.contentAsString
        val snapId = mapper.readTree(snap).get("id").asText()

        mockMvc.perform(delete("/workflows/$idB/snapshots/$snapId"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `runs API enqueue + list + get`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        val versionId = wf.get("graph").get("versionId").asText()

        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"versionId":"$versionId","nodes":[
                    {"id":"n1","type":"stub","position":{"x":0,"y":0},"data":{"label":"L"}}
                ],"connections":[]}"""),
        ).andExpect(status().isOk)

        val enqueue = mockMvc.perform(
            post("/workflows/$id/runs")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"event":"e2e"}"""),
        ).andExpect(status().isAccepted)
            .andReturn().response.contentAsString
        val runId = mapper.readTree(enqueue).get("id").asText()

        // Wait until executed.
        val deadline = System.currentTimeMillis() + 8_000
        var finalStatus = ""
        while (System.currentTimeMillis() < deadline) {
            val r = mockMvc.perform(get("/workflow-runs/$runId"))
                .andExpect(status().isOk)
                .andReturn().response.contentAsString
            finalStatus = mapper.readTree(r).get("status").asText()
            if (finalStatus != "queued" && finalStatus != "running") break
            Thread.sleep(80)
        }
        assertTrue(finalStatus == "success" || finalStatus == "failed", "got $finalStatus")

        mockMvc.perform(get("/workflows/$id/runs"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))

        mockMvc.perform(get("/workflow-runs/$runId/result"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(runId))
    }

    @Test
    fun `runs API unknown id returns 404`() {
        mockMvc.perform(get("/workflow-runs/-1"))
            .andExpect(status().isNotFound)
        mockMvc.perform(get("/workflow-runs/-1/result"))
            .andExpect(status().isNotFound)
        mockMvc.perform(get("/node-runs/-1"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `triggers PATCH toggles enabled flag`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        val versionId = wf.get("graph").get("versionId").asText()

        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"versionId":"$versionId","nodes":[
                    {"id":"wh","type":"trigger.webhook","position":{"x":0,"y":0},"data":{"label":"WH"}}
                ],"connections":[]}"""),
        ).andExpect(status().isOk)

        val list = mockMvc.perform(get("/workflows/$id/triggers"))
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
        val triggerId = mapper.readTree(list).get(0).get("id").asText()

        mockMvc.perform(
            patch("/workflows/$id/triggers/$triggerId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"enabled":false}"""),
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.enabled").value(false))
    }

    @Test
    fun `webhook with unknown token returns 404`() {
        mockMvc.perform(
            post("/webhook/missing-${UUID.randomUUID()}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `webhook end-to-end accepted with poll location`() {
        val wf = createWorkflow()
        val versionId = wf.get("graph").get("versionId").asText()
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"versionId":"$versionId","nodes":[
                    {"id":"wh","type":"trigger.webhook","position":{"x":0,"y":0},"data":{"label":"WH"}}
                ],"connections":[]}"""),
        ).andExpect(status().isOk)
        val triggers = mockMvc.perform(get("/workflows/${wf.get("meta").get("id").asText()}/triggers"))
            .andReturn().response.contentAsString
        val token = mapper.readTree(triggers).get(0).get("token").asText()

        mockMvc.perform(
            post("/webhook/$token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"x":1}"""),
        ).andExpect(status().isAccepted)
            .andExpect(jsonPath("$.run.id").exists())
            .andExpect(jsonPath("$.pollUrl").exists())
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
