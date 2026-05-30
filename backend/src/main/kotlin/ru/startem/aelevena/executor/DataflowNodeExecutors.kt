package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import org.springframework.stereotype.Component

private fun resolveStreamInput(input: JsonNode, config: JsonNode?): JsonNode {
    if (!input.isObject || !input.has("inputs")) {
        return input
    }
    val inputs = input.get("inputs")
    if (!inputs.isObject) {
        return input
    }
    val from = config?.get("from")?.asText()?.takeIf { it.isNotBlank() }
    if (from != null && inputs.has(from)) {
        return inputs.get(from)
    }
    val keys = inputs.fieldNames().asSequence().toList()
    if (keys.size == 1) {
        return inputs.get(keys[0])
    }
    return input
}

private fun expr(config: JsonNode?): String? =
    config?.get("expression")?.asText()?.takeIf { it.isNotBlank() }

private fun JsonNode?.asArrayOrEmpty(mapper: ObjectMapper): ArrayNode {
    if (this == null || this.isNull) {
        return mapper.createArrayNode()
    }
    if (this.isArray) {
        return this as ArrayNode
    }
    return mapper.createArrayNode().add(this)
}

private fun JsonNode.fieldOrSelf(fieldName: String?): JsonNode {
    if (fieldName.isNullOrBlank()) {
        return this
    }
    return this.get(fieldName) ?: this
}

private fun compare(a: JsonNode, op: String, b: JsonNode): Boolean {
    if (a.isNumber && b.isNumber) {
        val left = a.asDouble()
        val right = b.asDouble()
        return when (op) {
            "eq" -> left == right
            "ne" -> left != right
            "gt" -> left > right
            "gte" -> left >= right
            "lt" -> left < right
            "lte" -> left <= right
            else -> throw IllegalArgumentException("unknown op '$op'")
        }
    }
    val left = a.asText()
    val right = b.asText()
    return when (op) {
        "eq" -> left == right
        "ne" -> left != right
        else -> throw IllegalArgumentException("op '$op' supports only numbers")
    }
}

@Component
class FilterNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val expressions: ExpressionEvaluator = ExpressionEvaluator(objectMapper),
) : NodeExecutor {
    override val type: String = "dataflow.filter"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
        expr(config)?.let { return expressions.filter(items, it) }
        val field = config?.get("field")?.asText()
        val op = config?.get("op")?.asText()
        val value = config?.get("value")

        val out = objectMapper.createArrayNode()
        for (item in items) {
            val left = item.fieldOrSelf(field)
            val keep = if (op != null && value != null) {
                compare(left, op, value)
            } else {
                !left.isNull && !(left.isBoolean && !left.asBoolean()) && !(left.isNumber && left.asDouble() == 0.0) && !(left.isTextual && left.asText().isEmpty())
            }
            if (keep) {
                out.add(item)
            }
        }
        return out
    }
}

@Component
class MapNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val expressions: ExpressionEvaluator = ExpressionEvaluator(objectMapper),
) : NodeExecutor {
    override val type: String = "dataflow.map"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
        expr(config)?.let { return expressions.map(items, it) }
        val select = config?.get("select")?.takeIf { it.isArray }?.map { it.asText() }
        val rename = config?.get("rename")?.takeIf { it.isObject }
        val wrap = config?.get("wrap")?.asText()?.takeIf { it.isNotBlank() }

        val out = objectMapper.createArrayNode()
        for (item in items) {
            val transformed: JsonNode = when {
                wrap != null -> objectMapper.createObjectNode().set<JsonNode>(wrap, item)
                select != null && item.isObject -> {
                    val obj = objectMapper.createObjectNode()
                    for (k in select) {
                        item.get(k)?.let { obj.set<JsonNode>(k, it) }
                    }
                    obj
                }
                rename != null && item.isObject -> {
                    val obj = objectMapper.createObjectNode()
                    rename.fields().forEachRemaining { (newName, oldNameNode) ->
                        item.get(oldNameNode.asText())?.let { obj.set<JsonNode>(newName, it) }
                    }
                    obj
                }
                else -> item
            }
            out.add(transformed)
        }
        return out
    }
}

@Component
class ReduceNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val expressions: ExpressionEvaluator = ExpressionEvaluator(objectMapper),
) : NodeExecutor {
    override val type: String = "dataflow.reduce"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
        expr(config)?.let { expression ->
            val initial = config?.get("initialValue") ?: objectMapper.nullNode()
            return expressions.reduce(items, expression, initial)
        }
        val op = config?.get("op")?.asText() ?: "count"
        val field = config?.get("field")?.asText()

        if (op == "count") {
            return objectMapper.createObjectNode().put("result", items.size())
        }

        val values = items.mapNotNull { item ->
            val v = item.fieldOrSelf(field)
            if (v.isNumber) v.asDouble() else null
        }
        if (values.isEmpty()) {
            return objectMapper.createObjectNode().put("result", 0)
        }

        val result = when (op) {
            "sum" -> values.sum()
            "min" -> values.min()
            "max" -> values.max()
            "avg" -> values.average()
            else -> throw IllegalArgumentException("unknown reduce op '$op'")
        }
        return objectMapper.createObjectNode().put("result", result)
    }
}

@Component
class ForeachNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val expressions: ExpressionEvaluator = ExpressionEvaluator(objectMapper),
) : NodeExecutor {
    override val type: String = "dataflow.foreach"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
        expr(config)?.let { return expressions.forEach(items, it) }
        return items
    }
}

@Component
class FlatMapNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val expressions: ExpressionEvaluator = ExpressionEvaluator(objectMapper),
) : NodeExecutor {
    override val type: String = "dataflow.flatmap"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
        expr(config)?.let { return expressions.flatMap(items, it) }
        val field = config?.get("field")?.asText()

        val out = objectMapper.createArrayNode()
        for (item in items) {
            val sub = if (field.isNullOrBlank()) item else item.get(field)
            if (sub != null && sub.isArray) {
                for (x in sub) {
                    out.add(x)
                }
            } else if (sub != null && !sub.isNull) {
                out.add(sub)
            }
        }
        return out
    }
}
