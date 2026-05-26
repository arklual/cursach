package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit coverage for NodeExecutorRegistry — confirms the missing/present lookup branches
 * and that the shared ObjectMapper accessor returns the injected instance.
 */
class NodeExecutorRegistryTest {

    private fun stub(name: String): NodeExecutor = object : NodeExecutor {
        override val type: String = name
        override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode =
            ObjectMapper().createObjectNode().put("type", name)
    }

    @Test
    fun `get returns null for unknown type`() {
        val reg = NodeExecutorRegistry(listOf(stub("a")), ObjectMapper())
        assertNull(reg.get("missing"))
    }

    @Test
    fun `get returns registered executor by type`() {
        val a = stub("a")
        val reg = NodeExecutorRegistry(listOf(a, stub("b")), ObjectMapper())
        assertSame(a, reg.get("a"))
    }

    @Test
    fun `getExecutor throws IllegalArgumentException for missing type`() {
        val reg = NodeExecutorRegistry(emptyList(), ObjectMapper())
        val ex = assertThrows(IllegalArgumentException::class.java) { reg.getExecutor("nope") }
        assertTrue(ex.message!!.contains("nope"))
    }

    @Test
    fun `getExecutor returns registered executor`() {
        val a = stub("a")
        val reg = NodeExecutorRegistry(listOf(a), ObjectMapper())
        assertSame(a, reg.getExecutor("a"))
    }

    @Test
    fun `getObjectMapper exposes the injected mapper instance`() {
        val mapper = ObjectMapper()
        val reg = NodeExecutorRegistry(emptyList(), mapper)
        assertSame(mapper, reg.getObjectMapper())
    }

    @Test
    fun `duplicate type collapses to the last entry (associateBy semantics)`() {
        val first = stub("dup")
        val second = stub("dup")
        val reg = NodeExecutorRegistry(listOf(first, second), ObjectMapper())
        assertEquals(second, reg.get("dup"))
    }
}
