package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.util.concurrent.TimeUnit

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SandboxDockerIntegrationTest {

    private val mapper: ObjectMapper = jacksonObjectMapper()
    private val sandbox = ContainerSandboxRunner(mapper)
    private val python = PythonNodeExecutor(mapper, sandbox)
    private val javascript = JavaScriptNodeExecutor(mapper, sandbox)

    @BeforeAll
    fun requireDocker() {
        assumeTrue(dockerAvailable(), "docker daemon недоступен — пропускаем реальные sandbox-тесты")
    }

    @Test
    fun `python really executes user run() function inside docker`() {
        val cfg = mapper.createObjectNode().put("code", "def run(inp):\n    return inp['a'] + inp['b']")
        val out = python.execute("py-sum", cfg, mapper.readTree("""{"a":40,"b":2}"""))
        assertEquals(42, out.get("result").asInt())
    }

    @Test
    fun `python supports output variable convention`() {
        val cfg = mapper.createObjectNode().put("code", "output = [1, 2, 3]")
        val out = python.execute("py-out", cfg, mapper.nullNode())
        val arr = out.get("result")
        assertTrue(arr.isArray && arr.size() == 3) { "expected [1,2,3], got $out" }
        assertEquals(3, arr.get(2).asInt())
    }

    @Test
    fun `python user exception surfaces as a failed node run`() {
        val cfg = mapper.createObjectNode().put("code", "raise ValueError('boom from user code')")
        val ex = org.junit.jupiter.api.Assertions.assertThrows(RuntimeException::class.java) {
            python.execute("py-err", cfg, mapper.nullNode())
        }
        assertTrue(ex.message!!.contains("boom from user code")) { "message was: ${ex.message}" }
    }

    @Test
    fun `python sandbox has no network access (--network none is real)`() {
        val cfg = mapper.createObjectNode().put(
            "code",
            "import urllib.request\n" +
                "def run(inp):\n" +
                "    return urllib.request.urlopen('http://example.com', timeout=3).status",
        )
        org.junit.jupiter.api.Assertions.assertThrows(RuntimeException::class.java) {
            python.execute("py-net", cfg, mapper.nullNode())
        }
    }

    @Test
    fun `javascript really executes user code inside docker`() {
        val cfg = mapper.createObjectNode().put("code", "return input.x * 2;")
        val out = javascript.execute("js-double", cfg, mapper.readTree("""{"x":21}"""))
        assertEquals(42, out.get("result").asInt())
    }

    @Test
    fun `javascript supports output variable convention`() {
        val cfg = mapper.createObjectNode().put("code", "var output = 'hi-' + input.name;")
        val out = javascript.execute("js-out", cfg, mapper.readTree("""{"name":"flux"}"""))
        assertEquals("hi-flux", out.get("result").asText())
    }

    @Test
    fun `javascript user error surfaces as a failed node run`() {
        val cfg = mapper.createObjectNode().put("code", "throw new Error('js boom');")
        val ex = org.junit.jupiter.api.Assertions.assertThrows(RuntimeException::class.java) {
            javascript.execute("js-err", cfg, mapper.nullNode())
        }
        assertTrue(ex.message!!.contains("js boom")) { "message was: ${ex.message}" }
    }

    @Test
    fun `non-json container stdout is wrapped into a raw envelope`() {
        val out = sandbox.run(
            label = "raw-probe",
            image = PythonNodeExecutor.DEFAULT_IMAGE,
            runtimeCommand = listOf("python", "-c", "print('plain text, not json')"),
            payload = mapper.createObjectNode(),
            codeTimeoutSeconds = 5L,
        )
        assertTrue(out.has("raw")) { "expected raw envelope, got $out" }
        assertTrue(out.get("raw").asText().contains("plain text, not json"))
    }

    private fun dockerAvailable(): Boolean = try {
        val p = ProcessBuilder("docker", "version", "--format", "{{.Server.Version}}")
            .redirectErrorStream(true)
            .start()
        val finished = p.waitFor(20, TimeUnit.SECONDS)
        if (!finished) {
            p.destroyForcibly()
            false
        } else {
            p.exitValue() == 0
        }
    } catch (_: Exception) {
        false
    }
}
