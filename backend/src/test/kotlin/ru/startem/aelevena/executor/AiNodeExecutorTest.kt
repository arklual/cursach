package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets

class AiNodeExecutorTest {

    private val mapper = ObjectMapper()
    private val executor = AiNodeExecutor(mapper).apply {
        // По умолчанию никаких ключей в окружении: тесты задают apiKey явно либо проверяют ошибку.
        environmentReader = { null }
    }
    private lateinit var server: HttpServer
    private lateinit var baseUrl: String

    /** Последний полученный сервером запрос — для проверок заголовков/тела. */
    private var lastBody: JsonNode? = null
    private val lastHeaders = mutableMapOf<String, String>()

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

    private fun respond(path: String, status: Int, responseJson: String) {
        server.createContext(path, HttpHandler { ex: HttpExchange ->
            ex.requestHeaders.forEach { (k, v) -> lastHeaders[k.lowercase()] = v.firstOrNull() ?: "" }
            val requestBody = ex.requestBody.readBytes().toString(StandardCharsets.UTF_8)
            lastBody = if (requestBody.isNotBlank()) mapper.readTree(requestBody) else null
            val bytes = responseJson.toByteArray(StandardCharsets.UTF_8)
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(status, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        })
    }

    private fun cfg(vararg pairs: Pair<String, Any?>): JsonNode {
        val node = mapper.createObjectNode()
        for ((k, v) in pairs) {
            when (v) {
                null -> node.putNull(k)
                is String -> node.put(k, v)
                is Int -> node.put(k, v)
                is Long -> node.put(k, v)
                is Double -> node.put(k, v)
                is Boolean -> node.put(k, v)
                is JsonNode -> node.set<JsonNode>(k, v)
                else -> node.put(k, v.toString())
            }
        }
        return node
    }

    @Test
    fun `openai chat completion returns normalized text and metadata`() {
        respond(
            "/v1/chat/completions", 200,
            """
            {"model":"gpt-4o-mini","choices":[{"finish_reason":"stop",
            "message":{"role":"assistant","content":"Hello there!"}}],
            "usage":{"total_tokens":12}}
            """.trimIndent(),
        )

        val config = cfg(
            "provider" to "openai",
            "apiKey" to "sk-test",
            "prompt" to "Say hi",
            "baseUrl" to "$baseUrl/v1",
        )
        val out = executor.execute("n1", config, mapper.nullNode())

        assertEquals("Hello there!", out.get("text").asText())
        assertEquals("openai", out.get("provider").asText())
        assertEquals("gpt-4o-mini", out.get("model").asText())
        assertEquals("stop", out.get("finishReason").asText())
        assertEquals(12, out.get("usage").get("total_tokens").asInt())
        assertNotNull(out.get("raw"))
        // Authorization-заголовок и тело запроса.
        assertEquals("Bearer sk-test", lastHeaders["authorization"])
        assertEquals("gpt-4o-mini", lastBody?.get("model")?.asText())
        assertEquals("user", lastBody?.get("messages")?.get(0)?.get("role")?.asText())
        assertEquals("Say hi", lastBody?.get("messages")?.get(0)?.get("content")?.asText())
    }

    @Test
    fun `openai includes system message and temperature when configured`() {
        respond("/v1/chat/completions", 200, """{"choices":[{"message":{"content":"ok"}}]}""")

        val config = cfg(
            "apiKey" to "sk-test",
            "system" to "You are terse.",
            "prompt" to "hi",
            "temperature" to 0.2,
            "maxTokens" to 256,
            "baseUrl" to "$baseUrl/v1",
        )
        executor.execute("n", config, mapper.nullNode())

        val messages = lastBody?.get("messages")!!
        assertEquals("system", messages.get(0).get("role").asText())
        assertEquals("You are terse.", messages.get(0).get("content").asText())
        assertEquals("user", messages.get(1).get("role").asText())
        assertEquals(0.2, lastBody?.get("temperature")?.asDouble())
        assertEquals(256, lastBody?.get("max_tokens")?.asInt())
    }

    @Test
    fun `anthropic returns concatenated text blocks and sends required headers`() {
        respond(
            "/v1/messages", 200,
            """
            {"model":"claude-3-5-sonnet-latest","stop_reason":"end_turn",
            "content":[{"type":"text","text":"Part 1. "},{"type":"text","text":"Part 2."}],
            "usage":{"output_tokens":7}}
            """.trimIndent(),
        )

        val config = cfg(
            "provider" to "anthropic",
            "apiKey" to "key-abc",
            "system" to "Be helpful.",
            "prompt" to "Hi Claude",
            "baseUrl" to baseUrl,
        )
        val out = executor.execute("n", config, mapper.nullNode())

        assertEquals("Part 1. Part 2.", out.get("text").asText())
        assertEquals("anthropic", out.get("provider").asText())
        assertEquals("end_turn", out.get("finishReason").asText())
        assertEquals("key-abc", lastHeaders["x-api-key"])
        assertEquals("2023-06-01", lastHeaders["anthropic-version"])
        // system — отдельное верхнеуровневое поле, max_tokens обязателен.
        assertEquals("Be helpful.", lastBody?.get("system")?.asText())
        assertTrue(lastBody?.has("max_tokens") == true)
    }

    @Test
    fun `gemini maps assistant role to model and extracts candidate text`() {
        respond(
            "/v1beta/models/gemini-1.5-flash:generateContent", 200,
            """
            {"modelVersion":"gemini-1.5-flash-001",
            "candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Gemini says hi"}]}}],
            "usageMetadata":{"totalTokenCount":5}}
            """.trimIndent(),
        )

        val config = cfg(
            "provider" to "gemini",
            "apiKey" to "g-key",
            "prompt" to "Hello",
            "baseUrl" to baseUrl,
        )
        val out = executor.execute("n", config, mapper.nullNode())

        assertEquals("Gemini says hi", out.get("text").asText())
        assertEquals("gemini", out.get("provider").asText())
        assertEquals("STOP", out.get("finishReason").asText())
        assertEquals("gemini-1.5-flash-001", out.get("model").asText())
        assertEquals("g-key", lastHeaders["x-goog-api-key"])
        assertEquals("user", lastBody?.get("contents")?.get(0)?.get("role")?.asText())
    }

    @Test
    fun `prompt template is rendered from upstream inputs`() {
        respond("/v1/chat/completions", 200, """{"choices":[{"message":{"content":"done"}}]}""")

        val envelope = mapper.readTree("""{"inputs":{"fetch":{"title":"FluxPilot"}}}""")
        val config = cfg(
            "apiKey" to "sk-test",
            "prompt" to "Summarize: \${inputs.fetch.title}",
            "baseUrl" to "$baseUrl/v1",
        )
        executor.execute("n", config, envelope)

        assertEquals("Summarize: FluxPilot", lastBody?.get("messages")?.get(0)?.get("content")?.asText())
    }

    @Test
    fun `messages array with system role is folded into top-level system`() {
        respond("/v1/messages", 200, """{"content":[{"type":"text","text":"ok"}]}""")

        val messages = mapper.createArrayNode()
        messages.addObject().put("role", "system").put("content", "S1")
        messages.addObject().put("role", "user").put("content", "U1")
        messages.addObject().put("role", "assistant").put("content", "A1")
        messages.addObject().put("role", "user").put("content", "U2")
        val config = cfg(
            "provider" to "anthropic",
            "apiKey" to "k",
            "baseUrl" to baseUrl,
            "messages" to messages,
        )
        executor.execute("n", config, mapper.nullNode())

        assertEquals("S1", lastBody?.get("system")?.asText())
        val sent = lastBody?.get("messages")!!
        assertEquals(3, sent.size())
        assertEquals("user", sent.get(0).get("role").asText())
        assertEquals("assistant", sent.get(1).get("role").asText())
    }

    @Test
    fun `api key falls back to environment variable when config omits it`() {
        respond("/v1/chat/completions", 200, """{"choices":[{"message":{"content":"ok"}}]}""")
        executor.environmentReader = { name -> if (name == "OPENAI_API_KEY") "env-key" else null }

        val config = cfg("prompt" to "hi", "baseUrl" to "$baseUrl/v1")
        executor.execute("n", config, mapper.nullNode())

        assertEquals("Bearer env-key", lastHeaders["authorization"])
    }

    @Test
    fun `missing prompt and messages throws`() {
        val config = cfg("provider" to "openai", "apiKey" to "k", "baseUrl" to "$baseUrl/v1")
        assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n", config, mapper.nullNode())
        }
    }

    @Test
    fun `missing api key throws with helpful message`() {
        val config = cfg("provider" to "openai", "prompt" to "hi")
        val ex = assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n", config, mapper.nullNode())
        }
        assertTrue(ex.message!!.contains("OPENAI_API_KEY"))
    }

    @Test
    fun `unknown provider throws`() {
        val config = cfg("provider" to "skynet", "apiKey" to "k", "prompt" to "hi")
        val ex = assertThrows(IllegalArgumentException::class.java) {
            executor.execute("n", config, mapper.nullNode())
        }
        assertTrue(ex.message!!.contains("unknown provider"))
    }

    @Test
    fun `non-2xx response surfaces status and body`() {
        respond("/v1/chat/completions", 429, """{"error":{"message":"rate limited"}}""")
        val config = cfg("apiKey" to "k", "prompt" to "hi", "baseUrl" to "$baseUrl/v1")
        val ex = assertThrows(IllegalStateException::class.java) {
            executor.execute("n", config, mapper.nullNode())
        }
        assertTrue(ex.message!!.contains("429"))
        assertTrue(ex.message!!.contains("rate limited"))
    }

    @Test
    fun `type is ai`() {
        assertEquals("ai", executor.type)
        assertNull(lastBody) // sanity: no request issued
    }
}
