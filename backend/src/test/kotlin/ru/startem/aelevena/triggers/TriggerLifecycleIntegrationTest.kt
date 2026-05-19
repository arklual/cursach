package ru.startem.aelevena.triggers

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Duration
import java.util.UUID

/**
 * Покрытие TriggerService.syncFromGraph + TriggerScheduler + TriggersRepository по сценариям:
 *  - cron / interval / webhook nodes (старые ключи cron/everySeconds и фронтовые expression/periodSeconds)
 *  - удаление trigger-ноды снимает строку
 *  - setEnabled
 *  - валидация config'а для cron/interval
 *  - manual-нода не превращается в trigger row
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = [
        "app.seed.demo-workflows-enabled=false",
        "spring.main.web-application-type=none",
    ],
)
@Import(TriggerLifecycleIntegrationTest.ContainersConfig::class)
class TriggerLifecycleIntegrationTest {

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
    @Autowired private lateinit var triggerService: TriggerService
    @Autowired private lateinit var triggersRepository: TriggersRepository
    @Autowired private lateinit var objectMapper: ObjectMapper

    private fun freshWorkflow(): Pair<UUID, Long> {
        val created = workflowService.createWorkflow(WorkflowCreateRequest(name = "trig-test-${UUID.randomUUID()}"))
        return UUID.fromString(created.meta.id) to created.graph.versionId.toLong()
    }

    private fun triggerNode(id: String, subtype: String, configJson: String? = null): Node {
        val cfg = configJson?.let { objectMapper.readTree(it) }
        return Node(
            id = id,
            type = "trigger.$subtype",
            position = Position(0.0, 0.0),
            data = NodeData(label = subtype, config = cfg),
        )
    }

    @Test
    fun `webhook node gets token, list-by-workflow returns it`() {
        val (wfId, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("wh-1", "webhook")), connections = emptyList())
        workflowService.updateGraph(versionId, graph)

        val list = triggerService.list(wfId)
        assertEquals(1, list.size)
        val webhook = list.first()
        assertEquals("webhook", webhook.type)
        assertNotNull(webhook.token)
        assertTrue(webhook.token!!.isNotEmpty())
    }

    @Test
    fun `manual trigger node creates no row in triggers`() {
        val (wfId, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("man-1", "manual")), connections = emptyList())
        workflowService.updateGraph(versionId, graph)

        val list = triggerService.list(wfId)
        assertTrue(list.isEmpty(), "manual triggers must not get persisted rows: $list")
    }

    @Test
    fun `cron node with expression key persists and exposes config`() {
        val (wfId, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("c-1", "cron", """{"expression":"0 */5 * * * *"}""")),
            connections = emptyList())
        workflowService.updateGraph(versionId, graph)

        val list = triggerService.list(wfId)
        assertEquals(1, list.size)
        assertEquals("cron", list[0].type)
        val cfg = list[0].config!!
        assertEquals("0 */5 * * * *", (cfg.get("expression") ?: cfg.get("cron"))?.asText())
    }

    @Test
    fun `cron node with legacy cron key still validates`() {
        val (wfId, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("c-2", "cron", """{"cron":"0 0 * * * *"}""")),
            connections = emptyList())
        workflowService.updateGraph(versionId, graph)
        val list = triggerService.list(wfId)
        assertEquals(1, list.size)
    }

    @Test
    fun `cron node without expression rejected`() {
        val (_, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("c-bad", "cron", """{"unrelated":"x"}""")),
            connections = emptyList())
        assertThrows(BadRequestException::class.java) {
            workflowService.updateGraph(versionId, graph)
        }
    }

    @Test
    fun `interval node with periodSeconds key persists`() {
        val (wfId, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("i-1", "interval", """{"periodSeconds":15}""")),
            connections = emptyList())
        workflowService.updateGraph(versionId, graph)
        val list = triggerService.list(wfId)
        assertEquals("interval", list.first().type)
    }

    @Test
    fun `interval node with everySeconds legacy key persists`() {
        val (wfId, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("i-2", "interval", """{"everySeconds":30}""")),
            connections = emptyList())
        workflowService.updateGraph(versionId, graph)
        assertEquals(1, triggerService.list(wfId).size)
    }

    @Test
    fun `interval with zero periodSeconds rejected`() {
        val (_, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("i-bad", "interval", """{"periodSeconds":0}""")),
            connections = emptyList())
        assertThrows(BadRequestException::class.java) {
            workflowService.updateGraph(versionId, graph)
        }
    }

    @Test
    fun `unknown trigger subtype rejected`() {
        val (_, versionId) = freshWorkflow()
        val graph = WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("u-1", "weird")),
            connections = emptyList())
        assertThrows(BadRequestException::class.java) {
            workflowService.updateGraph(versionId, graph)
        }
    }

    @Test
    fun `removing trigger node from graph deletes the row`() {
        val (wfId, versionId) = freshWorkflow()
        workflowService.updateGraph(versionId, WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("wh-1", "webhook")), connections = emptyList()))
        assertEquals(1, triggerService.list(wfId).size)

        workflowService.updateGraph(versionId, WorkflowGraph(versionId = versionId.toString(),
            nodes = emptyList(), connections = emptyList()))
        assertTrue(triggerService.list(wfId).isEmpty())
    }

    @Test
    fun `setEnabled flips flag and is idempotent on second call with same value`() {
        val (wfId, versionId) = freshWorkflow()
        workflowService.updateGraph(versionId, WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("c-1", "cron", """{"expression":"0 * * * * *"}""")),
            connections = emptyList()))

        val row = triggersRepository.listByWorkflow(wfId).first()
        val updated = triggerService.setEnabled(wfId, row.id, false)
        assertEquals(false, updated.enabled)
        // idempotent — same value, no exception
        val again = triggerService.setEnabled(wfId, row.id, false)
        assertEquals(false, again.enabled)
        // toggle back on
        val on = triggerService.setEnabled(wfId, row.id, true)
        assertEquals(true, on.enabled)
    }

    @Test
    fun `setEnabled on unknown trigger throws NotFoundException`() {
        val (wfId, _) = freshWorkflow()
        assertThrows(NotFoundException::class.java) {
            triggerService.setEnabled(wfId, triggerId = -1L, enabled = true)
        }
    }

    @Test
    fun `setEnabled refuses cross-workflow id`() {
        val (wfA, vA) = freshWorkflow()
        val (wfB, _) = freshWorkflow()
        workflowService.updateGraph(vA, WorkflowGraph(versionId = vA.toString(),
            nodes = listOf(triggerNode("wh-1", "webhook")), connections = emptyList()))
        val row = triggersRepository.listByWorkflow(wfA).first()

        assertThrows(NotFoundException::class.java) {
            triggerService.setEnabled(wfB, row.id, false)
        }
    }

    @Test
    fun `list on unknown workflow throws NotFoundException`() {
        assertThrows(NotFoundException::class.java) {
            triggerService.list(UUID.randomUUID())
        }
    }

    @Test
    fun `handleWebhook with unknown token throws`() {
        assertThrows(NotFoundException::class.java) {
            triggerService.handleWebhook("non-existent-token-${UUID.randomUUID()}", null)
        }
    }

    @Test
    fun `webhook token survives subsequent graph save`() {
        val (wfId, versionId) = freshWorkflow()
        workflowService.updateGraph(versionId, WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("wh-1", "webhook")), connections = emptyList()))
        val tokenBefore = triggerService.list(wfId).first().token
        assertNotNull(tokenBefore)

        // save again — token must NOT regenerate
        workflowService.updateGraph(versionId, WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("wh-1", "webhook")), connections = emptyList()))
        val tokenAfter = triggerService.list(wfId).first().token
        assertEquals(tokenBefore, tokenAfter)
    }

    @Test
    fun `findByToken returns null for disabled trigger`() {
        val (wfId, versionId) = freshWorkflow()
        workflowService.updateGraph(versionId, WorkflowGraph(versionId = versionId.toString(),
            nodes = listOf(triggerNode("wh-1", "webhook")), connections = emptyList()))
        val row = triggersRepository.listByWorkflow(wfId).first()
        triggerService.setEnabled(wfId, row.id, false)

        // disabled — must not be findable by token
        val found = triggersRepository.findByToken(row.token!!)
        assertNull(found)
    }

    @Test
    fun `repository upsert is idempotent on workflow+nodeId conflict`() {
        val (wfId, _) = freshWorkflow()
        val first = triggersRepository.upsertByWorkflowAndNode(wfId, "n-1", "webhook", null, "tok-1")
        val second = triggersRepository.upsertByWorkflowAndNode(wfId, "n-1", "webhook", null, "tok-2")
        assertEquals(first, second, "upsert by same (workflowId,nodeId) must keep id stable")

        // Existing token should be preserved (coalesce on conflict) — null new shouldn't overwrite.
        val third = triggersRepository.upsertByWorkflowAndNode(wfId, "n-1", "webhook", null, null)
        assertEquals(first, third)
        val row = triggersRepository.findByWorkflowAndNode(wfId, "n-1")!!
        assertEquals("tok-1", row.token, "token must be coalesced (kept) on conflict")
    }

    @Test
    fun `repository listEnabledScheduled returns cron and interval only`() {
        val (wfId, _) = freshWorkflow()
        triggersRepository.upsertByWorkflowAndNode(wfId, "c-1", "cron", """{"expression":"* * * * * *"}""", null)
        triggersRepository.upsertByWorkflowAndNode(wfId, "i-1", "interval", """{"periodSeconds":60}""", null)
        triggersRepository.upsertByWorkflowAndNode(wfId, "w-1", "webhook", null, "tok-x")

        val list = triggersRepository.listEnabledScheduled()
        val types = list.filter { it.workflowId == wfId }.map { it.type }.toSet()
        assertTrue("cron" in types)
        assertTrue("interval" in types)
        assertFalse("webhook" in types)
    }

    @Test
    fun `repository deleteByWorkflowIdAndNodeIdNotIn drops absent ids only`() {
        val (wfId, _) = freshWorkflow()
        triggersRepository.upsertByWorkflowAndNode(wfId, "a", "webhook", null, "ta")
        triggersRepository.upsertByWorkflowAndNode(wfId, "b", "webhook", null, "tb")

        // Keep only "a"
        val dropped = triggersRepository.deleteByWorkflowIdAndNodeIdNotIn(wfId, listOf("a"))
        assertEquals(1, dropped.size)
        assertNull(triggersRepository.findByWorkflowAndNode(wfId, "b"))
        assertNotNull(triggersRepository.findByWorkflowAndNode(wfId, "a"))

        // Empty keep set — wipes everything for the workflow.
        val droppedAll = triggersRepository.deleteByWorkflowIdAndNodeIdNotIn(wfId, emptyList())
        assertEquals(1, droppedAll.size)
        assertTrue(triggersRepository.listByWorkflow(wfId).isEmpty())
    }

    @Test
    fun `repository setEnabled returns false for unknown id`() {
        val ok = triggersRepository.setEnabled(triggerId = -42L, enabled = false)
        assertFalse(ok)
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
