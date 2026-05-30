package ru.startem.aelevena.run

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

@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@Import(
    DebugSessionIntegrationTest.ContainersConfig::class,
    DebugSessionIntegrationTest.ExecutorsConfig::class,
)
class DebugSessionIntegrationTest {

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
        fun props(registry: DynamicPropertyRegistry) {
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

    private fun createWorkflow(): JsonNode {
        val res = mockMvc.perform(
            post("/workflows")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"dbg-${UUID.randomUUID()}"}"""),
        ).andExpect(status().isCreated)
            .andReturn().response.contentAsString
        return mapper.readTree(res)
    }

    private fun installLinearGraph(wf: JsonNode): Triple<String, String, List<String>> {
        val id = wf.get("meta").get("id").asText()
        val versionId = wf.get("graph").get("versionId").asText()
        val payload = """
          {"versionId":"$versionId","nodes":[
            {"id":"a","type":"stub","position":{"x":0,"y":0},"data":{"label":"A"}},
            {"id":"b","type":"stub","position":{"x":1,"y":0},"data":{"label":"B"}},
            {"id":"c","type":"stub","position":{"x":2,"y":0},"data":{"label":"C"}}
          ],"connections":[
            {"id":"e1","source":"a","target":"b"},
            {"id":"e2","source":"b","target":"c"}
          ]}
        """.trimIndent()
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload),
        ).andExpect(status().isOk)
        return Triple(id, versionId, listOf("a", "b", "c"))
    }

    private fun start(workflowId: String, body: String? = null): JsonNode {
        val req = post("/workflows/$workflowId/debug-sessions")
            .contentType(MediaType.APPLICATION_JSON)
        if (body != null) req.content(body)
        val raw = mockMvc.perform(req)
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
        return mapper.readTree(raw)
    }

    @Test
    fun `full happy-path step-through`() {
        val wf = createWorkflow()
        val (id, _, _) = installLinearGraph(wf)

        val started = start(id, """{"input":{"hello":"world"}}""")
        val sessionId = started.get("sessionId").asText()
        assertNotNull(sessionId)
        assertEquals("ready", started.get("status").asText())
        assertEquals(listOf("a"), started.get("ready").map { it.asText() })
        assertEquals("world", started.get("input").get("hello").asText())
        assertTrue(started.get("readyInputs").has("a"))

        val fetched = mockMvc.perform(get("/debug-sessions/$sessionId"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.sessionId").value(sessionId))
            .andReturn().response.contentAsString
        assertEquals(sessionId, mapper.readTree(fetched).get("sessionId").asText())

        val afterA = mockMvc.perform(
            post("/debug-sessions/$sessionId/step")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"nodeId":"a"}"""),
        ).andExpect(status().isOk)
            .andReturn().response.contentAsString
        val afterATree = mapper.readTree(afterA)
        assertEquals("stepping", afterATree.get("status").asText())
        assertEquals(listOf("a"), afterATree.get("completed").map { it.asText() })
        assertEquals(listOf("b"), afterATree.get("ready").map { it.asText() })
        assertTrue(afterATree.get("outputs").has("a"))

        mockMvc.perform(
            post("/debug-sessions/$sessionId/step")
                .contentType(MediaType.APPLICATION_JSON),
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.completed.length()").value(2))

        val ended = mockMvc.perform(post("/debug-sessions/$sessionId/run-to-end"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("done"))
            .andReturn().response.contentAsString
        val endedTree = mapper.readTree(ended)
        assertEquals(3, endedTree.get("completed").size())
        assertEquals(0, endedTree.get("ready").size())

        mockMvc.perform(post("/debug-sessions/$sessionId/run-to-end"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("done"))

        mockMvc.perform(post("/debug-sessions/$sessionId/step"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("done"))

        mockMvc.perform(delete("/debug-sessions/$sessionId"))
            .andExpect(status().isOk)
        mockMvc.perform(get("/debug-sessions/$sessionId"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `start without body uses defaults`() {
        val wf = createWorkflow()
        val (id, _, _) = installLinearGraph(wf)
        val started = start(id)
        assertEquals("ready", started.get("status").asText())
        assertTrue(started.get("input").isNull)
    }

    @Test
    fun `start with explicit startNodeId restricts reachable set`() {
        val wf = createWorkflow()
        val (id, _, _) = installLinearGraph(wf)

        val started = start(id, """{"startNodeId":"b"}""")
        assertEquals(listOf("b"), started.get("ready").map { it.asText() })

        val sessionId = started.get("sessionId").asText()
        mockMvc.perform(post("/debug-sessions/$sessionId/run-to-end"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.completed.length()").value(2))
    }

    @Test
    fun `start with startNodeId that does not exist returns 400`() {
        val wf = createWorkflow()
        val (id, _, _) = installLinearGraph(wf)
        mockMvc.perform(
            post("/workflows/$id/debug-sessions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"startNodeId":"ghost"}"""),
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `start on unknown workflow returns 404`() {
        mockMvc.perform(
            post("/workflows/${UUID.randomUUID()}/debug-sessions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `step on unknown session returns 404`() {
        mockMvc.perform(
            post("/debug-sessions/no-such-session/step")
                .contentType(MediaType.APPLICATION_JSON),
        ).andExpect(status().isNotFound)
    }

    @Test
    fun `get on unknown session returns 404`() {
        mockMvc.perform(get("/debug-sessions/no-such-session"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `runToEnd on unknown session returns 404`() {
        mockMvc.perform(post("/debug-sessions/no-such-session/run-to-end"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `step with non-ready nodeId returns 400`() {
        val wf = createWorkflow()
        val (id, _, _) = installLinearGraph(wf)
        val started = start(id)
        val sessionId = started.get("sessionId").asText()
        mockMvc.perform(
            post("/debug-sessions/$sessionId/step")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"nodeId":"c"}"""),
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `failing node marks session failed and ready becomes empty`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        val versionId = wf.get("graph").get("versionId").asText()
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"versionId":"$versionId","nodes":[
                       {"id":"a","type":"stub","position":{"x":0,"y":0},"data":{"label":"A"}},
                       {"id":"x","type":"explode","position":{"x":1,"y":0},"data":{"label":"X"}}
                       ],"connections":[
                       {"id":"e","source":"a","target":"x"}
                       ]}""",
                ),
        ).andExpect(status().isOk)

        val started = start(id)
        val sessionId = started.get("sessionId").asText()

        mockMvc.perform(post("/debug-sessions/$sessionId/step"))
            .andExpect(status().isOk)
        val afterFail = mockMvc.perform(post("/debug-sessions/$sessionId/step"))
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
        val tree = mapper.readTree(afterFail)
        assertEquals("failed", tree.get("status").asText())
        assertEquals(1, tree.get("failed").size())
        assertEquals("x", tree.get("failed").get(0).get("nodeId").asText())
        assertEquals(0, tree.get("ready").size())
    }

    @Test
    fun `unknown node type makes start succeed but step 400`() {
        val wf = createWorkflow()
        val id = wf.get("meta").get("id").asText()
        val versionId = wf.get("graph").get("versionId").asText()
        mockMvc.perform(
            put("/workflow-versions/$versionId/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"versionId":"$versionId","nodes":[
                       {"id":"only","type":"definitely-not-registered","position":{"x":0,"y":0},"data":{"label":"X"}}
                       ],"connections":[]}""",
                ),
        ).andExpect(status().isOk)

        val started = start(id)
        val sessionId = started.get("sessionId").asText()
        mockMvc.perform(post("/debug-sessions/$sessionId/step"))
            .andExpect(status().isBadRequest)
    }

    @TestConfiguration
    class ExecutorsConfig {
        @Bean
        fun stubExecutor(mapper: ObjectMapper): NodeExecutor =
            object : NodeExecutor {
                override val type: String = "stub"
                override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
                    val out = mapper.createObjectNode()
                    out.put("from", nodeId)
                    out.set<JsonNode>("input", input)
                    return out
                }
            }

        @Bean
        fun explodeExecutor(): NodeExecutor =
            object : NodeExecutor {
                override val type: String = "explode"
                override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode =
                    throw IllegalStateException("boom from $nodeId")
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
