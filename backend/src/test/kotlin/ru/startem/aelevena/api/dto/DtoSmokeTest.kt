package ru.startem.aelevena.api.dto

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Покрывает сгенерированные методы data class'ов DTO — copy/equals/hashCode/toString
 * + round-trip через Jackson. Контракт API'я остаётся стабильным, а JaCoCo получает
 * coverage для членов, которые не цепляют интеграционные тесты (они проходят только
 * happy-path сериализацию).
 */
class DtoSmokeTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()

    @Test
    fun `WorkflowRun copy and equals and hashCode`() {
        val a = WorkflowRun(
            id = "1", workflowId = "w", status = "success",
            startedAt = "s", finishedAt = "f", durationMs = 100L,
            input = mapper.readTree("""{"x":1}"""),
            output = mapper.readTree("""{"y":2}"""),
            startNodeId = "n", nodes = emptyList(),
        )
        val b = a.copy()
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        val c = a.copy(status = "failed")
        assertNotEquals(a, c)
        assertTrue(a.toString().contains("success"))
    }

    @Test
    fun `WorkflowRun jackson round-trip preserves fields`() {
        val original = WorkflowRun(
            id = "r-1", workflowId = "w-1", status = "success",
            durationMs = 50L,
            output = mapper.readTree("""{"k":"v"}"""),
            nodes = listOf(
                NodeRun(
                    id = "nr-1", workflowRunId = "r-1", nodeId = "n1",
                    status = "success",
                    input = mapper.readTree("""[1]"""),
                    output = mapper.readTree("""[2]"""),
                ),
            ),
        )
        val json = mapper.writeValueAsString(original)
        val parsed = mapper.readValue(json, WorkflowRun::class.java)
        assertEquals(original.id, parsed.id)
        assertEquals(original.status, parsed.status)
        assertEquals(original.nodes.size, parsed.nodes.size)
        assertEquals(original.nodes[0].nodeId, parsed.nodes[0].nodeId)
    }

    @Test
    fun `NodeRun copy with default optionals null`() {
        val n = NodeRun(id = "1", workflowRunId = "2", nodeId = "x", status = "queued")
        assertNull(n.input)
        assertNull(n.output)
        assertNull(n.errorMessage)
        val copy = n.copy(errorMessage = "boom")
        assertEquals("boom", copy.errorMessage)
        assertNotEquals(n, copy)
    }

    @Test
    fun `WorkflowRunResult equals and toString`() {
        val r = WorkflowRunResult(
            id = "1", workflowId = "w", status = "success",
            durationMs = 100L, output = mapper.readTree("""{"a":1}"""),
        )
        val r2 = r.copy()
        assertEquals(r, r2)
        assertEquals(r.hashCode(), r2.hashCode())
        assertTrue(r.toString().contains("workflowId"))
    }

    @Test
    fun `WorkflowMeta covers all fields and copy`() {
        val m = WorkflowMeta(
            id = "1", name = "n", description = "d",
            nodesCount = 3,
            createdAt = "2026-01-01", updatedAt = "2026-01-02",
            isDemo = true,
        )
        val m2 = m.copy(name = "n2")
        assertNotEquals(m, m2)
        assertEquals("n2", m2.name)
        // JSON round-trip
        val json = mapper.writeValueAsString(m)
        val back = mapper.readValue(json, WorkflowMeta::class.java)
        assertEquals(m.id, back.id)
        assertEquals(m.isDemo, back.isDemo)
    }

    @Test
    fun `WorkflowVersion equals`() {
        val a = WorkflowVersion(id = "1", workflowId = "w", tag = "draft", createdAt = "t")
        val b = a.copy()
        assertEquals(a, b)
        val c = a.copy(tag = null)
        assertNotEquals(a, c)
    }

    @Test
    fun `Connection sourceHandle and variant fields supported`() {
        val c1 = Connection(id = "c1", source = "a", target = "b")
        val c2 = c1.copy(sourceHandle = "A", variant = "A")
        assertEquals("A", c2.sourceHandle)
        assertEquals("A", c2.variant)
        assertNotEquals(c1, c2)
    }

    @Test
    fun `Node with full data`() {
        val n = Node(
            id = "1", type = "stub",
            position = Position(1.0, 2.0),
            data = NodeData(label = "L", config = mapper.readTree("""{"x":1}""")),
        )
        val n2 = n.copy()
        assertEquals(n, n2)
        assertEquals("stub", n.type)
    }

    @Test
    fun `WorkflowGraph compose and equals`() {
        val g = WorkflowGraph(
            versionId = "1",
            nodes = listOf(Node("n1", "stub", Position(0.0, 0.0), NodeData("L"))),
            connections = listOf(Connection("c1", "n1", "n2")),
        )
        val g2 = g.copy()
        assertEquals(g, g2)
    }

    @Test
    fun `Workflow copy`() {
        val meta = WorkflowMeta(
            id = "1", name = "n", description = null,
            nodesCount = 0,
            createdAt = "t", updatedAt = "t",
        )
        val graph = WorkflowGraph(versionId = "v", nodes = emptyList(), connections = emptyList())
        val w = Workflow(meta = meta, graph = graph)
        val w2 = w.copy()
        assertEquals(w, w2)
    }

    @Test
    fun `Trigger equals and copy`() {
        val t = Trigger(
            id = "1", workflowId = "w", nodeId = "n", type = "webhook",
            config = mapper.readTree("""{"x":1}"""),
            token = "tok", enabled = true,
        )
        val t2 = t.copy(enabled = false)
        assertNotEquals(t, t2)
        assertEquals(t.copy(), t)
    }

    @Test
    fun `TriggerUpdate basic`() {
        val u = TriggerUpdate(enabled = true)
        val u2 = u.copy(enabled = false)
        assertNotEquals(u, u2)
    }

    @Test
    fun `WebhookAccepted contains run and pollUrl`() {
        val run = WorkflowRun(id = "1", workflowId = "w", status = "queued")
        val w = WebhookAccepted(run = run, pollUrl = "/poll")
        val w2 = w.copy()
        assertEquals(w, w2)
        assertEquals("/poll", w.pollUrl)
    }

    @Test
    fun `WorkflowSnapshot round-trip`() {
        val s = WorkflowSnapshot(
            id = "1", workflowId = "w",
            name = "v1", description = "d",
            createdAt = "t",
        )
        val json = mapper.writeValueAsString(s)
        val back = mapper.readValue(json, WorkflowSnapshot::class.java)
        assertEquals(s.id, back.id)
        assertEquals(s.name, back.name)
    }

    @Test
    fun `WorkflowMetaUpdate optional fields`() {
        val u = WorkflowMetaUpdate(name = "n", description = "d")
        val u2 = u.copy(description = null)
        assertNull(u2.description)
        assertNotEquals(u, u2)
    }

    @Test
    fun `CreateSnapshotRequest`() {
        val r = CreateSnapshotRequest(name = "x", description = "y")
        val r2 = r.copy()
        assertEquals(r, r2)
        assertNotNull(r.toString())
    }
}
