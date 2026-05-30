package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import org.graalvm.polyglot.Context
import org.springframework.stereotype.Component

/**
 * Вычислитель пользовательских выражений для dataflow-нод (ТЗ 4.1.1, требование 4 / ПМИ 6.4).
 *
 * Выражения пишутся как JavaScript над переменными `item` (текущий элемент) и `acc` (аккумулятор
 * для reduce) — например `item.age > 18`, `{name: item.name.toUpperCase()}`, `acc + item.price`,
 * `item.children`.
 *
 * Изоляция: каждое вычисление выполняется в контексте GraalJS с `allowAllAccess(false)` —
 * нет доступа к хост-объектам, файловой системе и сети. Данные передаются как JSON-строки и
 * парсятся/сериализуются через `JSON.parse`/`JSON.stringify`, поэтому host access не требуется.
 */
@Component
class ExpressionEvaluator(
    private val objectMapper: ObjectMapper,
) {
    private fun newContext(): Context =
        Context.newBuilder("js")
            .allowAllAccess(false)
            .build()

    /** filter: оставить элементы, для которых выражение истинно. */
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

    /** map: применить трансформацию к каждому элементу. */
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

    /** reduce: свернуть массив в одно значение, начиная с initial; в выражении доступны acc и item. */
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

    /** foreach: выполнить side-effect для каждого элемента, вернуть исходный список без изменений. */
    fun forEach(items: ArrayNode, expression: String): ArrayNode {
        newContext().use { ctx ->
            val fn = compile(ctx, expression)
            for (item in items) {
                invoke(ctx, fn, item, null)
            }
        }
        return items
    }

    /** flatmap: для каждого элемента вычислить выражение (ожидается массив) и склеить результаты. */
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

    /** Компилирует выражение в JS-функцию (item, acc) => JSON.stringify(<expr>). */
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
