package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PythonAndJavaScriptNodeExecutorTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()
    private val stubResult: JsonNode = mapper.readTree("""{"result":"ok"}""")

    private class CapturingSandbox(
        private val mapper: ObjectMapper,
        private val returning: JsonNode,
    ) : ContainerSandboxRunner(mapper) {
        data class Invocation(
            val label: String,
            val image: String,
            val runtimeCommand: List<String>,
            val payload: JsonNode,
            val codeTimeoutSeconds: Long,
        )

        val calls = mutableListOf<Invocation>()

        override fun run(
            label: String,
            image: String,
            runtimeCommand: List<String>,
            payload: JsonNode,
            codeTimeoutSeconds: Long,
        ): JsonNode {
            calls += Invocation(label, image, runtimeCommand, payload, codeTimeoutSeconds)
            return returning
        }
    }

    private fun newSandbox(returning: JsonNode = stubResult) = CapturingSandbox(mapper, returning)

    @Test
    fun `python missing code throws`() {
        val sandbox = newSandbox()
        val py = PythonNodeExecutor(mapper, sandbox)
        assertThrows(IllegalArgumentException::class.java) {
            py.execute("n", mapper.createObjectNode(), mapper.nullNode())
        }
        assertTrue(sandbox.calls.isEmpty(), "sandbox must not be touched on validation failure")
    }

    @Test
    fun `python null config throws`() {
        val py = PythonNodeExecutor(mapper, newSandbox())
        assertThrows(IllegalArgumentException::class.java) {
            py.execute("n", null, mapper.nullNode())
        }
    }

    @Test
    fun `python default image and timeout when config omits them`() {
        val sandbox = newSandbox()
        val py = PythonNodeExecutor(mapper, sandbox)

        val cfg = mapper.createObjectNode().put("code", "print(1)")
        val result = py.execute("n", cfg, mapper.readTree("""{"x":1}"""))
        assertEquals("ok", result.get("result").asText())

        val call = sandbox.calls.single()
        assertEquals("python node", call.label)
        assertEquals(PythonNodeExecutor.DEFAULT_IMAGE, call.image)
        assertEquals(5L, call.codeTimeoutSeconds)
        assertEquals("print(1)", call.payload.get("code").asText())
        assertEquals(1, call.payload.get("input").get("x").asInt())
    }

    @Test
    fun `python custom image and timeout are forwarded`() {
        val sandbox = newSandbox()
        val py = PythonNodeExecutor(mapper, sandbox)

        val cfg = mapper.createObjectNode()
            .put("code", "x = 1")
            .put("image", "custom-py:1")
            .put("timeoutSeconds", 12L)
        py.execute("n", cfg, mapper.readTree("[]"))

        val call = sandbox.calls.single()
        assertEquals("custom-py:1", call.image)
        assertEquals(12L, call.codeTimeoutSeconds)
        assertEquals("x = 1", call.payload.get("code").asText())
    }

    @Test
    fun `python blank image falls back to default`() {
        val sandbox = newSandbox()
        val py = PythonNodeExecutor(mapper, sandbox)

        val cfg = mapper.createObjectNode()
            .put("code", "x = 1")
            .put("image", "   ")
        py.execute("n", cfg, mapper.nullNode())

        assertEquals(PythonNodeExecutor.DEFAULT_IMAGE, sandbox.calls.single().image)
    }

    @Test
    fun `python returns sandbox result verbatim`() {
        val customResult = mapper.readTree("""{"result":{"data":[1,2,3]}}""")
        val sandbox = newSandbox(customResult)
        val py = PythonNodeExecutor(mapper, sandbox)

        val out = py.execute("n", mapper.createObjectNode().put("code", "noop"), mapper.nullNode())
        assertEquals(customResult, out)
    }

    @Test
    fun `python runtime command uses python -c RUNNER`() {
        val sandbox = newSandbox()
        val py = PythonNodeExecutor(mapper, sandbox)
        py.execute("n", mapper.createObjectNode().put("code", "x"), mapper.nullNode())

        val cmd = sandbox.calls.single().runtimeCommand
        assertEquals("python", cmd[0])
        assertEquals("-c", cmd[1])
        assertTrue(cmd[2].contains("json"))
    }

    @Test
    fun `js missing code throws`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)
        assertThrows(IllegalArgumentException::class.java) {
            js.execute("n", mapper.createObjectNode(), mapper.nullNode())
        }
        assertTrue(sandbox.calls.isEmpty())
    }

    @Test
    fun `js null config throws`() {
        val js = JavaScriptNodeExecutor(mapper, newSandbox())
        assertThrows(IllegalArgumentException::class.java) {
            js.execute("n", null, mapper.nullNode())
        }
    }

    @Test
    fun `js default image and timeout when omitted`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)

        js.execute("n", mapper.createObjectNode().put("code", "return 1;"), mapper.nullNode())

        val call = sandbox.calls.single()
        assertEquals("javascript node", call.label)
        assertEquals(JavaScriptNodeExecutor.DEFAULT_IMAGE, call.image)
        assertEquals(5L, call.codeTimeoutSeconds)
    }

    @Test
    fun `js custom timeout is forwarded`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)

        val cfg = mapper.createObjectNode()
            .put("code", "return 1;")
            .put("timeoutSeconds", 9L)
        js.execute("n", cfg, mapper.nullNode())

        assertEquals(9L, sandbox.calls.single().codeTimeoutSeconds)
    }

    @Test
    fun `js custom image overrides default`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)

        val cfg = mapper.createObjectNode()
            .put("code", "return 1;")
            .put("image", "node:21-alpine")
        js.execute("n", cfg, mapper.nullNode())

        assertEquals("node:21-alpine", sandbox.calls.single().image)
    }

    @Test
    fun `js blank image falls back to default`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)

        val cfg = mapper.createObjectNode()
            .put("code", "return 1;")
            .put("image", "")
        js.execute("n", cfg, mapper.nullNode())

        assertEquals(JavaScriptNodeExecutor.DEFAULT_IMAGE, sandbox.calls.single().image)
    }

    @Test
    fun `js payload includes input verbatim`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)

        val input = mapper.readTree("""{"a":1,"b":[1,2,3]}""")
        js.execute("n", mapper.createObjectNode().put("code", "return input;"), input)

        val call = sandbox.calls.single()
        assertEquals(input, call.payload.get("input"))
        assertEquals("return input;", call.payload.get("code").asText())
    }

    @Test
    fun `js runtime command uses node -e RUNNER`() {
        val sandbox = newSandbox()
        val js = JavaScriptNodeExecutor(mapper, sandbox)
        js.execute("n", mapper.createObjectNode().put("code", "x"), mapper.nullNode())

        val cmd = sandbox.calls.single().runtimeCommand
        assertEquals("node", cmd[0])
        assertEquals("-e", cmd[1])
        assertTrue(cmd[2].contains("process.stdin"))
    }

    @Test
    fun `js sandbox can return error envelope and executor returns it verbatim`() {
        val err = mapper.readTree("""{"error":"boom","trace":"..."}""")
        val sandbox = newSandbox(err)
        val js = JavaScriptNodeExecutor(mapper, sandbox)
        val out = js.execute("n", mapper.createObjectNode().put("code", "x"), mapper.nullNode())
        assertEquals("boom", out.get("error").asText())
        assertNull(out.get("result"))
    }
}
