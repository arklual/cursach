package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

@Component
class HttpNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "http"

    private val client: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        // URL / body / headers могут содержать `${inputs.someNode.field}` — раскрываем перед запросом,
        // чтобы пользователь мог собрать запрос из upstream-данных без Code-ноды посредника.
        val rawUrl = config?.get("url")?.asText()?.takeIf { it.isNotBlank() }
            ?: throw IllegalArgumentException("http node requires config.url")
        val url = InputTemplate.render(rawUrl, input, objectMapper)

        val method = config?.get("method")?.asText()?.uppercase() ?: "GET"
        val timeoutMs = config?.get("timeoutMs")?.asLong() ?: 30_000L

        val bodyNode = config?.get("body")?.let { InputTemplate.renderNode(it, input, objectMapper) }
        val bodyPublisher = when {
            bodyNode == null || bodyNode.isNull -> HttpRequest.BodyPublishers.noBody()
            bodyNode.isTextual -> HttpRequest.BodyPublishers.ofString(bodyNode.asText())
            else -> HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(bodyNode))
        }

        val requestBuilder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofMillis(timeoutMs))

        val headersNode = config?.get("headers")?.let { InputTemplate.renderNode(it, input, objectMapper) }
        if (headersNode != null && headersNode.isObject) {
            headersNode.fields().forEachRemaining { (k, v) ->
                if (v.isTextual) {
                    requestBuilder.header(k, v.asText())
                } else {
                    requestBuilder.header(k, v.toString())
                }
            }
        }

        val request = requestBuilder.method(method, bodyPublisher).build()

        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        val rawBody = response.body()

        val outHeaders = objectMapper.createObjectNode()
        response.headers().map().forEach { (k, v) ->
            outHeaders.put(k, v.joinToString(","))
        }

        // Parse the body as JSON when the response declares it OR when the bytes look
        // structurally JSON-ish. Otherwise the body is stored as a raw string and the
        // frontend renders escape sequences (\n, \") literally — see pretty-output.ts.
        val responseBody: JsonNode = parseBodyAsJsonOrNull(rawBody, response.headers())
            ?: objectMapper.getNodeFactory().textNode(rawBody)

        val out = objectMapper.createObjectNode()
            .put("statusCode", response.statusCode())
        out.set<JsonNode>("body", responseBody)
        out.set<JsonNode>("headers", outHeaders)
        return out
    }

    private fun parseBodyAsJsonOrNull(body: String, headers: java.net.http.HttpHeaders): JsonNode? {
        if (body.isEmpty()) {
            return null
        }
        val contentType = headers.firstValue("content-type").orElse("").lowercase()
        val declaredJson = contentType.contains("json")
        if (!declaredJson) {
            val trimmedFirst = body.trimStart().firstOrNull() ?: return null
            if (trimmedFirst != '{' && trimmedFirst != '[') {
                return null
            }
        }
        return try {
            objectMapper.readTree(body)
        } catch (_: Exception) {
            null
        }
    }
}

