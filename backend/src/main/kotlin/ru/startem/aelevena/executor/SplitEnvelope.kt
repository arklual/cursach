package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode

object SplitEnvelope {
    fun resolveForEdge(upstream: JsonNode, edgeVariant: String?): JsonNode {
        if (!upstream.isObject) {
            return upstream
        }
        val mode = upstream.get("mode")?.asText() ?: return upstream
        return when (mode) {
            "split" -> {
                val variants = upstream.get("variants") ?: return upstream
                if (edgeVariant != null && variants.has(edgeVariant)) {
                    variants.get(edgeVariant)
                } else {
                    upstream
                }
            }
            "pick" -> upstream.get("payload") ?: upstream
            else -> upstream
        }
    }

    fun isPickEnvelope(node: JsonNode): Boolean {
        return node.isObject && node.get("mode")?.asText() == "pick"
    }

    fun pickChosen(node: JsonNode): String? {
        return if (isPickEnvelope(node)) node.get("chosen")?.asText() else null
    }
}
