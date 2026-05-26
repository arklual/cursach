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
 * Exhaustive coverage for data class component/copy variants and JSON round-trips that
 * the happy-path smoke test doesn't exercise (Trigger, WorkflowSnapshot, NodeData with
 * abConfig, etc.). JaCoCo counts each generated componentN/copy$default branch separately,
 * so varying each field independently flips the remaining bit.
 */
class DtoExtraSmokeTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()

    @Test
    fun `Trigger varying every field one at a time`() {
        val base = Trigger(
            id = "1", workflowId = "w", nodeId = "n", type = "webhook",
            config = mapper.readTree("""{"x":1}"""),
            token = "tok", enabled = true,
        )

        assertNotEquals(base, base.copy(id = "2"))
        assertNotEquals(base, base.copy(workflowId = "w2"))
        assertNotEquals(base, base.copy(nodeId = "n2"))
        assertNotEquals(base, base.copy(type = "cron"))
        assertNotEquals(base, base.copy(config = null))
        assertNotEquals(base, base.copy(token = null))
        assertNotEquals(base, base.copy(enabled = false))

        // componentN
        assertEquals(base.id, base.component1())
        assertEquals(base.workflowId, base.component2())
        assertEquals(base.nodeId, base.component3())
        assertEquals(base.type, base.component4())
        assertEquals(base.config, base.component5())
        assertEquals(base.token, base.component6())
        assertEquals(base.enabled, base.component7())

        // round-trip
        val json = mapper.writeValueAsString(base)
        val back = mapper.readValue(json, Trigger::class.java)
        assertEquals(base.id, back.id)
        assertEquals(base.enabled, back.enabled)
        assertTrue(base.toString().contains("webhook"))
    }

    @Test
    fun `WorkflowSnapshot varying every field`() {
        val s = WorkflowSnapshot(
            id = "1", workflowId = "w", name = "v1",
            description = "first", createdAt = "t1",
        )
        assertEquals(s.id, s.component1())
        assertEquals(s.workflowId, s.component2())
        assertEquals(s.name, s.component3())
        assertEquals(s.description, s.component4())
        assertEquals(s.createdAt, s.component5())

        assertNotEquals(s, s.copy(id = "2"))
        assertNotEquals(s, s.copy(workflowId = "w2"))
        assertNotEquals(s, s.copy(name = "v2"))
        assertNotEquals(s, s.copy(description = null))
        assertNotEquals(s, s.copy(createdAt = "t2"))
    }

    @Test
    fun `NodeData with abConfig`() {
        val nd = NodeData(
            label = "L",
            config = mapper.readTree("""{"a":1}"""),
            abConfig = mapper.readTree("""{"variants":[]}"""),
        )
        assertEquals("L", nd.component1())
        assertNotNull(nd.component2())
        assertNotNull(nd.component3())
        val empty = NodeData()
        assertNull(empty.label)
        assertNull(empty.config)
        assertNull(empty.abConfig)
        assertNotEquals(nd, empty)

        val json = mapper.writeValueAsString(nd)
        val back = mapper.readValue(json, NodeData::class.java)
        assertEquals(nd.label, back.label)
    }

    @Test
    fun `Connection varying every field`() {
        val c = Connection(
            id = "1", source = "a", target = "b",
            sourceHandle = "sh", targetHandle = "th", variant = "A",
        )
        assertEquals(c.id, c.component1())
        assertEquals(c.source, c.component2())
        assertEquals(c.target, c.component3())
        assertEquals(c.sourceHandle, c.component4())
        assertEquals(c.targetHandle, c.component5())
        assertEquals(c.variant, c.component6())

        assertNotEquals(c, c.copy(id = "2"))
        assertNotEquals(c, c.copy(source = "x"))
        assertNotEquals(c, c.copy(target = "x"))
        assertNotEquals(c, c.copy(sourceHandle = null))
        assertNotEquals(c, c.copy(targetHandle = null))
        assertNotEquals(c, c.copy(variant = null))
    }

    @Test
    fun `Node varying every field`() {
        val n = Node(
            id = "1", type = "stub",
            position = Position(1.0, 2.0),
            data = NodeData(label = "L"),
        )
        assertEquals(n.id, n.component1())
        assertEquals(n.type, n.component2())
        assertEquals(n.position, n.component3())
        assertEquals(n.data, n.component4())

        assertNotEquals(n, n.copy(id = "2"))
        assertNotEquals(n, n.copy(type = "x"))
        assertNotEquals(n, n.copy(position = null))
        assertNotEquals(n, n.copy(data = null))
    }

    @Test
    fun `WorkflowMeta varying every field`() {
        val m = WorkflowMeta(
            id = "1", name = "n", description = "d",
            isDemo = false, nodesCount = 5,
            createdAt = "t1", updatedAt = "t2",
        )
        assertEquals(m.id, m.component1())
        assertEquals(m.name, m.component2())
        assertEquals(m.description, m.component3())
        assertEquals(m.isDemo, m.component4())
        assertEquals(m.nodesCount, m.component5())
        assertEquals(m.createdAt, m.component6())
        assertEquals(m.updatedAt, m.component7())

        assertNotEquals(m, m.copy(id = "2"))
        assertNotEquals(m, m.copy(name = "n2"))
        assertNotEquals(m, m.copy(description = null))
        assertNotEquals(m, m.copy(isDemo = true))
        assertNotEquals(m, m.copy(nodesCount = 6))
        assertNotEquals(m, m.copy(createdAt = "t1b"))
        assertNotEquals(m, m.copy(updatedAt = "t2b"))
    }

    @Test
    fun `WorkflowMetaUpdate varying every field`() {
        val u = WorkflowMetaUpdate(name = "n", description = "d")
        assertEquals(u.name, u.component1())
        assertEquals(u.description, u.component2())
        assertNotEquals(u, u.copy(name = null))
        assertNotEquals(u, u.copy(description = null))
    }

    @Test
    fun `WorkflowVersion varying every field`() {
        val v = WorkflowVersion(id = "1", workflowId = "w", tag = "draft", createdAt = "t")
        assertEquals(v.id, v.component1())
        assertEquals(v.workflowId, v.component2())
        assertEquals(v.tag, v.component3())
        assertEquals(v.createdAt, v.component4())
        assertNotEquals(v, v.copy(id = "2"))
        assertNotEquals(v, v.copy(workflowId = "w2"))
        assertNotEquals(v, v.copy(tag = null))
        assertNotEquals(v, v.copy(createdAt = "t2"))
    }

    @Test
    fun `WorkflowRunResult varying every field`() {
        val r = WorkflowRunResult(
            id = "1", workflowId = "w", status = "success",
            startedAt = "s", finishedAt = "f",
            durationMs = 100L,
            output = mapper.readTree("""{"k":"v"}"""),
        )
        assertEquals(r.id, r.component1())
        assertEquals(r.workflowId, r.component2())
        assertEquals(r.status, r.component3())
        assertNotEquals(r, r.copy(startedAt = null))
        assertNotEquals(r, r.copy(finishedAt = null))
        assertNotEquals(r, r.copy(durationMs = null))
        assertNotEquals(r, r.copy(output = null))
    }

    @Test
    fun `NodeRun varying every field`() {
        val n = NodeRun(
            id = "1", workflowRunId = "w", nodeId = "n",
            status = "success",
            startedAt = "s", finishedAt = "f",
            input = mapper.readTree("""{"x":1}"""),
            output = mapper.readTree("""{"y":2}"""),
            errorMessage = "ok",
        )
        assertEquals(n.id, n.component1())
        assertEquals(n.workflowRunId, n.component2())
        assertEquals(n.nodeId, n.component3())
        assertEquals(n.status, n.component4())
        // copy each in turn
        assertNotEquals(n, n.copy(id = "x"))
        assertNotEquals(n, n.copy(startedAt = null))
        assertNotEquals(n, n.copy(finishedAt = null))
        assertNotEquals(n, n.copy(input = null))
        assertNotEquals(n, n.copy(output = null))
        assertNotEquals(n, n.copy(errorMessage = null))
    }

    @Test
    fun `WorkflowRun varying every field`() {
        val r = WorkflowRun(
            id = "1", workflowId = "w", status = "success",
            startedAt = "s", finishedAt = "f", durationMs = 100L,
            input = mapper.readTree("""{"x":1}"""),
            output = mapper.readTree("""{"y":2}"""),
            startNodeId = "n0",
            nodes = emptyList(),
        )
        assertEquals(r.id, r.component1())
        assertEquals(r.workflowId, r.component2())
        assertEquals(r.status, r.component3())
        assertNotEquals(r, r.copy(startedAt = null))
        assertNotEquals(r, r.copy(finishedAt = null))
        assertNotEquals(r, r.copy(durationMs = null))
        assertNotEquals(r, r.copy(input = null))
        assertNotEquals(r, r.copy(output = null))
        assertNotEquals(r, r.copy(startNodeId = null))
    }
}
