package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * AI-нода: запрос к LLM-провайдеру (OpenAI, Anthropic Claude, Google Gemini, либо любой
 * OpenAI-совместимый endpoint через `baseUrl` — Groq, OpenRouter, Ollama, vLLM и т. п.).
 *
 * Config (строковые поля поддерживают `${...}`-подстановку из upstream-нод — см. InputTemplate,
 * это позволяет собрать промпт из данных предыдущих нод: `${inputs.fetch.body.title}`):
 *   provider     "openai" | "anthropic" | "gemini"  (по умолчанию "openai")
 *   model        имя модели (по умолчанию зависит от провайдера)
 *   apiKey       ключ API. Если пусто — берётся из переменной окружения
 *                (OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY | GOOGLE_API_KEY).
 *   prompt       текст пользовательского сообщения (если `messages` не заданы)
 *   messages     [ { "role": "user"|"assistant"|"system", "content": "..." }, ... ]
 *   system       системный промпт (опционально)
 *   temperature  число (опционально)
 *   maxTokens    максимум токенов ответа (по умолчанию 1024)
 *   baseUrl      переопределение базового URL (для self-hosted / совместимых API)
 *   timeoutMs    тайм-аут запроса (по умолчанию 60_000, максимум 300_000)
 *
 * Output — единый для всех провайдеров, downstream использует `${inputs.<node>.text}`:
 *   { "text": "...", "model": "...", "provider": "...", "finishReason": "...",
 *     "usage": { ... }, "raw": { ...полный ответ провайдера... } }
 *
 * Ключи в config храним без шифрования (как и любой config-ноды через CAS-blob), поэтому
 * для прода рекомендуется оставлять `apiKey` пустым и задавать ключ переменной окружения.
 */
@Component
class AiNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "ai"

    /** Чтение API-ключа из окружения. Вынесено в поле, чтобы переопределять в тестах. */
    var environmentReader: (String) -> String? = { name -> System.getenv(name) }

    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()

    private companion object {
        const val DEFAULT_TIMEOUT_MS = 60_000L
        const val MAX_TIMEOUT_MS = 300_000L
        const val DEFAULT_MAX_TOKENS = 1024
        const val ANTHROPIC_VERSION = "2023-06-01"
    }

    /** Нормализованное сообщение чата: роль (user|assistant) + текст. */
    private data class ChatMessage(val role: String, val content: String)

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val provider = templated(config, "provider", input)?.lowercase()?.takeIf { it.isNotBlank() } ?: "openai"
        val timeoutMs = (config?.get("timeoutMs")?.asLong() ?: DEFAULT_TIMEOUT_MS).coerceIn(1L, MAX_TIMEOUT_MS)
        val model = templated(config, "model", input)?.takeIf { it.isNotBlank() } ?: defaultModel(provider)
        val apiKey = resolveApiKey(config, input, provider)
        val maxTokens = config?.get("maxTokens")?.asInt()?.takeIf { it > 0 } ?: DEFAULT_MAX_TOKENS
        val temperature = config?.get("temperature")?.takeIf { it.isNumber }?.asDouble()
        val baseUrl = templated(config, "baseUrl", input)?.trim()?.trimEnd('/')?.takeIf { it.isNotBlank() }
        val (system, messages) = buildMessages(config, input)

        val request = Request(model, apiKey, system, messages, temperature, maxTokens, baseUrl, timeoutMs)
        return when (provider) {
            "openai", "openai-compatible", "custom" -> callOpenAi(provider, request)
            "anthropic", "claude" -> callAnthropic(request)
            "gemini", "google" -> callGemini(request)
            else -> throw IllegalArgumentException(
                "ai node: unknown provider '$provider' (use openai | anthropic | gemini)",
            )
        }
    }

    private data class Request(
        val model: String,
        val apiKey: String,
        val system: String?,
        val messages: List<ChatMessage>,
        val temperature: Double?,
        val maxTokens: Int,
        val baseUrl: String?,
        val timeoutMs: Long,
    )

    private fun defaultModel(provider: String): String = when (provider) {
        "anthropic", "claude" -> "claude-3-5-sonnet-latest"
        "gemini", "google" -> "gemini-1.5-flash"
        else -> "gpt-4o-mini"
    }

    private fun resolveApiKey(config: JsonNode?, input: JsonNode, provider: String): String {
        templated(config, "apiKey", input)?.takeIf { it.isNotBlank() }?.let { return it }
        val envNames = when (provider) {
            "anthropic", "claude" -> listOf("ANTHROPIC_API_KEY")
            "gemini", "google" -> listOf("GEMINI_API_KEY", "GOOGLE_API_KEY")
            else -> listOf("OPENAI_API_KEY")
        }
        for (name in envNames) {
            environmentReader(name)?.takeIf { it.isNotBlank() }?.let { return it }
        }
        throw IllegalArgumentException(
            "ai node ($provider): missing apiKey — set config.apiKey or env ${envNames.joinToString(" / ")}",
        )
    }

    /**
     * Собирает системный промпт и список user/assistant-сообщений.
     * Приоритет у `messages`; если их нет — одно user-сообщение из `prompt`. Любые `system`-роли
     * внутри `messages` сливаются в общий системный промпт (большинство провайдеров держат его отдельно).
     */
    private fun buildMessages(config: JsonNode?, input: JsonNode): Pair<String?, List<ChatMessage>> {
        var system = templated(config, "system", input)?.takeIf { it.isNotBlank() }
        val out = mutableListOf<ChatMessage>()

        val messagesNode = config?.get("messages")
        if (messagesNode != null && messagesNode.isArray && messagesNode.size() > 0) {
            for (m in messagesNode) {
                val role = m.get("role")?.asText()?.lowercase()?.takeIf { it.isNotBlank() } ?: "user"
                val content = renderContent(m.get("content"), input)
                if (role == "system") {
                    system = if (system.isNullOrBlank()) content else "$system\n$content"
                } else {
                    out.add(ChatMessage(if (role == "assistant") "assistant" else "user", content))
                }
            }
        } else {
            val prompt = templated(config, "prompt", input)?.takeIf { it.isNotBlank() }
                ?: throw IllegalArgumentException("ai node requires config.prompt or config.messages")
            out.add(ChatMessage("user", prompt))
        }

        if (out.isEmpty()) {
            throw IllegalArgumentException("ai node: messages must contain at least one user/assistant message")
        }
        return system to out
    }

    private fun renderContent(content: JsonNode?, input: JsonNode): String = when {
        content == null || content.isNull -> ""
        content.isTextual -> InputTemplate.render(content.asText(), input, objectMapper)
        else -> objectMapper.writeValueAsString(InputTemplate.renderNode(content, input, objectMapper))
    }

    // ----- провайдеры -----

    private fun callOpenAi(provider: String, req: Request): JsonNode {
        val base = req.baseUrl ?: "https://api.openai.com/v1"
        val body = objectMapper.createObjectNode()
        body.put("model", req.model)
        val arr = body.putArray("messages")
        if (!req.system.isNullOrBlank()) {
            arr.addObject().put("role", "system").put("content", req.system)
        }
        for (m in req.messages) {
            arr.addObject().put("role", m.role).put("content", m.content)
        }
        req.temperature?.let { body.put("temperature", it) }
        body.put("max_tokens", req.maxTokens)

        val json = send(
            url = "$base/chat/completions",
            headers = mapOf("Authorization" to "Bearer ${req.apiKey}", "Content-Type" to "application/json"),
            body = body,
            timeoutMs = req.timeoutMs,
            providerLabel = if (provider == "openai") "openai" else "openai-compatible",
        )
        val choice = json.path("choices").path(0)
        val text = choice.path("message").path("content").asText("")
        return output(
            text = text,
            model = json.path("model").asText(req.model),
            provider = "openai",
            finishReason = textOrNull(choice.path("finish_reason")),
            usage = json.get("usage"),
            raw = json,
        )
    }

    private fun callAnthropic(req: Request): JsonNode {
        val base = req.baseUrl ?: "https://api.anthropic.com"
        val body = objectMapper.createObjectNode()
        body.put("model", req.model)
        body.put("max_tokens", req.maxTokens)
        if (!req.system.isNullOrBlank()) {
            body.put("system", req.system)
        }
        req.temperature?.let { body.put("temperature", it) }
        val arr = body.putArray("messages")
        for (m in req.messages) {
            arr.addObject().put("role", m.role).put("content", m.content)
        }

        val json = send(
            url = "$base/v1/messages",
            headers = mapOf(
                "x-api-key" to req.apiKey,
                "anthropic-version" to ANTHROPIC_VERSION,
                "Content-Type" to "application/json",
            ),
            body = body,
            timeoutMs = req.timeoutMs,
            providerLabel = "anthropic",
        )
        // content — массив блоков; склеиваем текстовые.
        val sb = StringBuilder()
        json.path("content").forEach { block ->
            if (block.path("type").asText() == "text") {
                sb.append(block.path("text").asText(""))
            }
        }
        return output(
            text = sb.toString(),
            model = json.path("model").asText(req.model),
            provider = "anthropic",
            finishReason = textOrNull(json.path("stop_reason")),
            usage = json.get("usage"),
            raw = json,
        )
    }

    private fun callGemini(req: Request): JsonNode {
        val base = req.baseUrl ?: "https://generativelanguage.googleapis.com"
        val body = objectMapper.createObjectNode()
        val contents = body.putArray("contents")
        for (m in req.messages) {
            val node = contents.addObject().put("role", if (m.role == "assistant") "model" else "user")
            node.putArray("parts").addObject().put("text", m.content)
        }
        if (!req.system.isNullOrBlank()) {
            body.putObject("systemInstruction").putArray("parts").addObject().put("text", req.system)
        }
        val gen = body.putObject("generationConfig")
        req.temperature?.let { gen.put("temperature", it) }
        gen.put("maxOutputTokens", req.maxTokens)

        val json = send(
            url = "$base/v1beta/models/${req.model}:generateContent",
            headers = mapOf("x-goog-api-key" to req.apiKey, "Content-Type" to "application/json"),
            body = body,
            timeoutMs = req.timeoutMs,
            providerLabel = "gemini",
        )
        val candidate = json.path("candidates").path(0)
        val sb = StringBuilder()
        candidate.path("content").path("parts").forEach { part ->
            sb.append(part.path("text").asText(""))
        }
        return output(
            text = sb.toString(),
            model = json.path("modelVersion").asText(req.model),
            provider = "gemini",
            finishReason = textOrNull(candidate.path("finishReason")),
            usage = json.get("usageMetadata"),
            raw = json,
        )
    }

    // ----- общие утилиты -----

    private fun send(
        url: String,
        headers: Map<String, String>,
        body: JsonNode,
        timeoutMs: Long,
        providerLabel: String,
    ): JsonNode {
        val builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofMillis(timeoutMs))
        headers.forEach { (k, v) -> builder.header(k, v) }
        val request = builder
            .method("POST", HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
            .build()

        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        val raw = response.body() ?: ""
        if (response.statusCode() !in 200..299) {
            throw IllegalStateException(
                "ai node ($providerLabel) request failed: HTTP ${response.statusCode()} ${raw.take(500)}",
            )
        }
        return try {
            objectMapper.readTree(raw)
        } catch (ex: Exception) {
            throw IllegalStateException(
                "ai node ($providerLabel): could not parse provider response as JSON: ${raw.take(200)}",
                ex,
            )
        }
    }

    private fun output(
        text: String,
        model: String,
        provider: String,
        finishReason: String?,
        usage: JsonNode?,
        raw: JsonNode,
    ): JsonNode {
        val out = objectMapper.createObjectNode()
        out.put("text", text)
        out.put("model", model)
        out.put("provider", provider)
        if (finishReason != null) {
            out.put("finishReason", finishReason)
        }
        if (usage != null && !usage.isNull) {
            out.set<JsonNode>("usage", usage)
        }
        out.set<JsonNode>("raw", raw)
        return out
    }

    /** Читает строковое config-поле и раскрывает в нём `${...}`-плейсхолдеры из envelope-а ноды. */
    private fun templated(config: JsonNode?, key: String, input: JsonNode): String? {
        val node = config?.get(key) ?: return null
        if (node.isNull) return null
        return InputTemplate.render(node.asText(), input, objectMapper)
    }

    private fun textOrNull(node: JsonNode): String? =
        if (node.isMissingNode || node.isNull) null else node.asText()
}
