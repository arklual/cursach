package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import org.springframework.stereotype.Component

/**
 * MVP-набор dataflow-нод. Контракт:
 *   - input ожидается массив (если не массив — оборачиваем в одноэлементный список для filter/map/reduce, кроме foreach/flatmap).
 *   - config — простой JSON, без выражений (см. поля внутри каждого executor'а).
 *
 * Цель — закрыть MVP-требование «5. Потоки данных (filter / map / reduce / foreach / flatMap)»
 * без введения зависимости на JsonPath/SpEL. Если в будущем потребуются выражения —
 * заменить на единый ExpressionEvaluator, не трогая API.
 */

/**
 * Если на вход пришёл envelope от WorkflowExecutionService ({runInput, inputs:{dep:..}})
 * — извлекаем поток данных из upstream-ноды:
 *   - если config.from указан и совпадает с ключом в inputs — берём его;
 *   - иначе, если upstream ровно один — берём его;
 *   - иначе оставляем envelope как есть (тесты с прямым массивом / объектом не ломаются).
 *
 * Это даёт seed-плану возможность включать dataflow-цепочки прямо после HTTP/JS-нод
 * без специальной адаптации каждого executor'а.
 */
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

/**
 * Фильтр массива.
 * config: { "field": "amount", "op": "gt", "value": 100 }
 *   - op: eq | ne | gt | gte | lt | lte
 *   - если field отсутствует — сравниваем сам элемент.
 *   - если op отсутствует — оставляем «истинные» элементы (не null, не false, не 0, не "").
 */
@Component
class FilterNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "dataflow.filter"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
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

/**
 * Map: проекция полей или переименование.
 * config:
 *   { "select": ["id", "amount"] }              — оставить только эти поля
 *   { "rename": { "newName": "oldName" } }      — переименовать
 *   { "wrap": "value" }                         — каждый элемент x превратить в { "value": x }
 */
@Component
class MapNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "dataflow.map"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
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

/**
 * Reduce: сворачивает массив в скаляр.
 * config:
 *   { "op": "sum"|"count"|"min"|"max"|"avg", "field": "amount" }
 * Возвращает { "result": <number> }.
 */
@Component
class ReduceNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "dataflow.reduce"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
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

/**
 * Foreach: identity для массива (passthrough). В MVP не переоркеструет downstream-ноды —
 * это потребовало бы менять WorkflowExecutionService. Output = input (или wrap в массив).
 *
 * Когда понадобится «настоящий» foreach (fan-out по нодам) — переделать как маркер для оркестратора.
 */
@Component
class ForeachNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "dataflow.foreach"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        return resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
    }
}

/**
 * FlatMap: разворачивает массив массивов в плоский.
 * config:
 *   { "field": "items" } — каждый элемент входа имеет field=items (массив), результат — concat всех items.
 *   Без field — input должен быть массив массивов.
 */
@Component
class FlatMapNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "dataflow.flatmap"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val items = resolveStreamInput(input, config).asArrayOrEmpty(objectMapper)
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
