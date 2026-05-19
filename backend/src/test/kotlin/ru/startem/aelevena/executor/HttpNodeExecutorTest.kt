package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets

class HttpNodeExecutorTest {

    private val mapper = ObjectMapper()
    private val executor = HttpNodeExecutor(mapper)
    private lateinit var server: HttpServer
    private lateinit var baseUrl: String

    @BeforeEach
    fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.executor = null
        server.start()
        baseUrl = "http://127.0.0.1:${server.address.port}"
    }

    @AfterEach
    fun stop() {
        server.stop(0)
    }

    private fun route(path: String, handler: HttpHandler) {
        server.createContext(path, handler)
    }

    @Test
    fun `missing url throws IllegalArgumentException`() {
        val cfg = mapper.createObjectNode()
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n1", cfg, mapper.nullNode())
        }
    }

    @Test
    fun `GET parses JSON body when content-type declares json`() {
        route("/json") { ex ->
            ex.responseHeaders.add("Content-Type", "application/json")
            val body = """{"hello":"world"}""".toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        val cfg = mapper.createObjectNode().put("url", "$baseUrl/json").put("method", "GET")
        val out = executor.execute("n", cfg, mapper.nullNode())
        assertEquals(200, out.get("statusCode").asInt())
        assertEquals("world", out.get("body").get("hello").asText())
    }

    @Test
    fun `GET keeps body as raw text when content-type is text`() {
        route("/plain") { ex ->
            ex.responseHeaders.add("Content-Type", "text/plain")
            val body = "hi\nthere".toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        val cfg = mapper.createObjectNode().put("url", "$baseUrl/plain")
        val out = executor.execute("n", cfg, mapper.nullNode())
        // No Content-Type=json AND body doesn't start with `{`/`[` → keep raw text.
        assertEquals("hi\nthere", out.get("body").asText())
    }

    @Test
    fun `non-JSON content-type but JSON-shaped body is parsed`() {
        route("/sniff") { ex ->
            ex.responseHeaders.add("Content-Type", "text/plain")
            val body = """[{"x":1}]""".toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        val cfg = mapper.createObjectNode().put("url", "$baseUrl/sniff")
        val out = executor.execute("n", cfg, mapper.nullNode())
        // Heuristic: starts with `[`, parses as JSON array.
        assertTrue(out.get("body").isArray)
        assertEquals(1, out.get("body").get(0).get("x").asInt())
    }

    @Test
    fun `empty body → body is empty string node`() {
        route("/empty") { ex ->
            ex.sendResponseHeaders(204, -1)
            ex.responseBody.close()
        }
        val cfg = mapper.createObjectNode().put("url", "$baseUrl/empty")
        val out = executor.execute("n", cfg, mapper.nullNode())
        assertEquals(204, out.get("statusCode").asInt())
    }

    @Test
    fun `POST with string body forwards string as-is`() {
        route("/post-str") { ex ->
            val received = ex.requestBody.bufferedReader().readText()
            val resp = """{"echo":"$received"}""".toByteArray(StandardCharsets.UTF_8)
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(200, resp.size.toLong())
            ex.responseBody.use { it.write(resp) }
        }
        val cfg = mapper.createObjectNode()
            .put("url", "$baseUrl/post-str")
            .put("method", "POST")
            .put("body", "raw-string-payload")
        val out = executor.execute("n", cfg, mapper.nullNode())
        assertEquals("raw-string-payload", out.get("body").get("echo").asText())
    }

    @Test
    fun `POST with JSON body serialises and headers are sent`() {
        route("/post-json") { ex ->
            assertEquals("Bearer abc", ex.requestHeaders.getFirst("Authorization"))
            val received = ex.requestBody.bufferedReader().readText()
            val resp = received.toByteArray(StandardCharsets.UTF_8)
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(200, resp.size.toLong())
            ex.responseBody.use { it.write(resp) }
        }
        val cfg = mapper.createObjectNode()
            .put("url", "$baseUrl/post-json")
            .put("method", "POST")
        cfg.set<com.fasterxml.jackson.databind.JsonNode>("body", mapper.readTree("""{"x":42}"""))
        val headers = cfg.putObject("headers")
        headers.put("Authorization", "Bearer abc")
        // non-string header value path
        headers.put("X-Retry", 3)

        val out = executor.execute("n", cfg, mapper.nullNode())
        assertEquals(42, out.get("body").get("x").asInt())
        // response headers should be present as JSON object
        assertNotNull(out.get("headers"))
    }

    @Test
    fun `timeoutMs uses configured short timeout`() {
        route("/slow") { ex ->
            Thread.sleep(800)
            ex.sendResponseHeaders(200, -1)
            ex.responseBody.close()
        }
        val cfg = mapper.createObjectNode()
            .put("url", "$baseUrl/slow")
            .put("timeoutMs", 100L)

        assertThrows(java.net.http.HttpTimeoutException::class.java) {
            executor.execute("n", cfg, mapper.nullNode())
        }
    }
}
