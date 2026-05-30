package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import org.graalvm.polyglot.Context
import org.springframework.stereotype.Component

@Component
class ExpressionEvaluator(
    private val objectMapper: ObjectMapper,
) {
    private fun newContext(): Context =
        Context.newBuilder("js")
            .allowAllAccess(false)
            .build()

    fun filter(items: ArrayNode, expression: String): ArrayNode {
        val out = objectMapper.createArrayNode()
        newContext().use { ctx ->
            val fn = compile(ctx, expression)
            for (item in items) {
                val res = invoke(ctx, fn, item, null)
                if (res != null && res.asBoolean(false)) {
                    out.add(item)
                }
            }
        }
        return out
    }

    fun map(items: ArrayNode, expression: String): ArrayNode {
        val out = objectMapper.createArrayNode()
        newContext().use { ctx ->
            val fn = compile(ctx, expression)
            for (item in items) {
                out.add(invoke(ctx, fn, item, null) ?: objectMapper.nullNode())
            }
        }
        return out
    }

    fun reduce(items: ArrayNode, expression: String, initial: JsonNode): JsonNode {
        newContext().use { ctx ->
            val fn = compile(ctx, expression)
            var acc: JsonNode = initial
            for (item in items) {
                acc = invoke(ctx, fn, item, acc) ?: objectMapper.nullNode()
            }
            return acc
        }
    }

    fun forEach(items: ArrayNode, expression: String): ArrayNode {
        newContext().use { ctx ->
            val fn = compile(ctx, expression)
            for (item in items) {
                invoke(ctx, fn, item, null)
            }
        }
        return items
    }

    fun flatMap(items: ArrayNode, expression: String): ArrayNode {
        val out = objectMapper.createArrayNode()
        newContext().use { ctx ->
            val fn = compile(ctx, expression)
            for (item in items) {
                val res = invoke(ctx, fn, item, null) ?: continue
                if (res.isArray) {
                    res.forEach { out.add(it) }
                } else if (!res.isNull) {
                    out.add(res)
                }
            }
        }
        return out
    }

    private fun compile(ctx: Context, expression: String): org.graalvm.polyglot.Value {
        val script = """
            (function(itemJson, accJson) {
              var item = itemJson === null ? null : JSON.parse(itemJson);
              var acc = accJson === null ? undefined : JSON.parse(accJson);
              var __result = ($expression);
              return __result === undefined ? null : JSON.stringify(__result);
            })
        """.trimIndent()
        return ctx.eval("js", script)
    }

    private fun invoke(
        @Suppress("UNUSED_PARAMETER") ctx: Context,
        fn: org.graalvm.polyglot.Value,
        item: JsonNode,
        acc: JsonNode?,
    ): JsonNode? {
        val itemJson = objectMapper.writeValueAsString(item)
        val accJson = acc?.let { objectMapper.writeValueAsString(it) }
        val resultValue = fn.execute(itemJson, accJson)
        if (resultValue.isNull) {
            return null
        }
        val json = resultValue.asString()
        return objectMapper.readTree(json)
    }
}
