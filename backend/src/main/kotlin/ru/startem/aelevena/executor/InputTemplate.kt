package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper

/**
 * Шаблонная подстановка для конфигов нод (URL/body/headers у Http, и т.п.).
 *
 * Синтаксис: `${path.to.value}` где path начинается с любого top-level ключа envelope-а,
 * который executor строит для каждой ноды (`runInput`, `inputs`, `inputVariants`). Примеры:
 *
 *   ${inputs.fetchUser.body.id}        — статус-код запроса предыдущей http-ноды
 *   ${runInput.userId}                  — данные, переданные снаружи в run
 *   ${inputs.userQuery}                 — целый output upstream-ноды (полезно для body)
 *
 * Сегменты пути:
 *  - .name      — поле объекта (включая имена с дефисами через .)
 *  - .0 / [0]   — индекс массива
 *  - ["name"]   — поле с пробелами/спецсимволами
 *
 * Если значение не строка — сериализуется JSON-ом (для body); если строка — подставляется как есть.
 * Несуществующий путь оставляет плейсхолдер пустым (`""`), а не падает: в большинстве случаев это
 * лучше, чем 500-ка из-за опечатки в URL'е. Если плейсхолдер не закрыт (`${...` без `}`), он
 * остаётся в строке без подстановки.
 */
object InputTemplate {

    private val PLACEHOLDER = Regex("""\$\{([^}]+)}""")

    fun render(template: String, envelope: JsonNode, objectMapper: ObjectMapper): String {
        if ('$' !in template) return template
        return PLACEHOLDER.replace(template) { match ->
            val expr = match.groupValues[1].trim()
            val value = resolve(envelope, expr) ?: return@replace ""
            if (value.isTextual) value.asText() else objectMapper.writeValueAsString(value)
        }
    }

    fun renderNode(node: JsonNode, envelope: JsonNode, objectMapper: ObjectMapper): JsonNode {
        return when {
            node.isTextual -> {
                val rendered = render(node.asText(), envelope, objectMapper)
                if (rendered === node.asText()) node else objectMapper.getNodeFactory().textNode(rendered)
            }
            node.isObject -> {
                val out = objectMapper.createObjectNode()
                node.fields().forEachRemaining { (k, v) ->
                    out.set<JsonNode>(k, renderNode(v, envelope, objectMapper))
                }
                out
            }
            node.isArray -> {
                val out = objectMapper.createArrayNode()
                node.forEach { item -> out.add(renderNode(item, envelope, objectMapper)) }
                out
            }
            else -> node
        }
    }

    private fun resolve(root: JsonNode, expr: String): JsonNode? {
        // Walk path: split into segments handling both `a.b.c`, `a[0]`, and `a["b c"]`.
        val segments = tokenize(expr)
        var cur: JsonNode? = root
        for (seg in segments) {
            if (cur == null || cur.isMissingNode) return null
            cur = when (seg) {
                is PathSeg.Field -> cur.get(seg.name)
                is PathSeg.Index -> if (cur.isArray && seg.idx in 0 until cur.size()) cur.get(seg.idx) else null
            }
        }
        return cur
    }

    private sealed class PathSeg {
        data class Field(val name: String) : PathSeg()
        data class Index(val idx: Int) : PathSeg()
    }

    private fun tokenize(expr: String): List<PathSeg> {
        val out = mutableListOf<PathSeg>()
        var i = 0
        val sb = StringBuilder()
        fun flushField() {
            if (sb.isNotEmpty()) {
                val name = sb.toString()
                sb.clear()
                val asInt = name.toIntOrNull()
                if (asInt != null) out.add(PathSeg.Index(asInt)) else out.add(PathSeg.Field(name))
            }
        }
        while (i < expr.length) {
            when (val c = expr[i]) {
                '.' -> { flushField(); i++ }
                '[' -> {
                    flushField()
                    val end = expr.indexOf(']', i + 1)
                    require(end > 0) { "Unclosed [ in path expression: $expr" }
                    val inside = expr.substring(i + 1, end).trim()
                    val stripped = inside.trim('"', '\'')
                    val asInt = stripped.toIntOrNull()
                    if (asInt != null) out.add(PathSeg.Index(asInt)) else out.add(PathSeg.Field(stripped))
                    i = end + 1
                }
                else -> { sb.append(c); i++ }
            }
        }
        flushField()
        return out
    }
}
