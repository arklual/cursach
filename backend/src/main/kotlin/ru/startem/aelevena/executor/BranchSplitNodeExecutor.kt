package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Component

@Component
class BranchSplitNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "branch.split"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        require(config != null && config.isObject) { "branch.split requires object config" }
        val mode = config.get("mode")?.asText() ?: "split"
        val ctx = parseContext(nodeId, config)

        val resolvedInput = unwrapInputsEnvelope(input)
        val items = toArray(resolvedInput)

        return when (mode) {
            "split" -> executeSplit(items, ctx)
            "pick" -> executePick(items, ctx, resolvedInput)
            else -> throw IllegalArgumentException("unknown mode '$mode'")
        }
    }

    private fun executeSplit(items: ArrayNode, ctx: SplitContext): JsonNode {
        val buckets: MutableMap<String, ArrayNode> = ctx.variants
            .associate { it.key to objectMapper.createArrayNode() }
            .toMutableMap()
        val totals = mutableMapOf<String, Int>()

        for (item in items) {
            val key = BranchSplitStrategies.assignVariant(item, ctx) ?: continue
            val tagged = tagWithVariant(item, key)
            buckets.getOrPut(key) { objectMapper.createArrayNode() }.add(tagged)
            totals[key] = (totals[key] ?: 0) + 1
        }

        val out = objectMapper.createObjectNode()
        out.put("mode", "split")
        val variantsNode = objectMapper.createObjectNode()
        buckets.forEach { (k, v) -> variantsNode.set<JsonNode>(k, v) }
        out.set<JsonNode>("variants", variantsNode)

        val meta = objectMapper.createObjectNode()
        meta.put("strategy", ctx.strategy)
        val totalsNode = objectMapper.createObjectNode()
        totals.forEach { (k, v) -> totalsNode.put(k, v) }
        meta.set<JsonNode>("totals", totalsNode)
        out.set<JsonNode>("meta", meta)
        return out
    }

    private fun executePick(items: ArrayNode, ctx: SplitContext, payload: JsonNode): JsonNode {
        val sample: JsonNode = if (items.size() > 0) items.get(0) else objectMapper.createObjectNode()
        val chosen = BranchSplitStrategies.assignVariant(sample, ctx)
            ?: ctx.variants.first().key

        val out = objectMapper.createObjectNode()
        out.put("mode", "pick")
        out.put("chosen", chosen)
        out.set<JsonNode>("payload", payload)
        val meta = objectMapper.createObjectNode()
        meta.put("strategy", ctx.strategy)
        out.set<JsonNode>("meta", meta)
        return out
    }

    private fun tagWithVariant(item: JsonNode, key: String): JsonNode {
        if (!item.isObject) {
            return item
        }
        val copy = item.deepCopy<ObjectNode>()
        copy.put("_variant", key)
        return copy
    }

    private fun parseContext(nodeId: String, config: JsonNode): SplitContext {
        val variantsNode = config.get("variants")
        require(variantsNode != null && variantsNode.isArray && variantsNode.size() > 0) {
            "branch.split requires non-empty variants[]"
        }
        val variants = variantsNode.map {
            SplitVariant(
                key = it.get("key").asText(),
                label = it.get("label")?.asText() ?: it.get("key").asText(),
                weight = it.get("weight")?.asInt() ?: 0,
            )
        }

        val rules = config.get("rules")?.takeIf { it.isArray }?.map { r ->
            AttributeRule(
                variant = r.get("variant").asText(),
                field = r.get("field").asText(),
                op = r.get("op").asText(),
                value = r.get("value"),
            )
        }.orEmpty()

        return SplitContext(
            strategy = config.get("strategy")?.asText() ?: "random",
            variants = variants,
            userIdField = config.get("userIdField")?.asText(),
            salt = config.get("salt")?.asText() ?: nodeId,
            seed = config.get("seed")?.let { if (it.isNumber) it.asLong() else null },
            percentage = config.get("percentage")?.let { if (it.isNumber) it.asInt() else null },
            rules = rules,
            defaultVariant = config.get("defaultVariant")?.asText(),
            stratifyBy = config.get("stratifyBy")?.asText(),
        )
    }

    private fun unwrapInputsEnvelope(input: JsonNode): JsonNode {
        if (!input.isObject || !input.has("inputs")) {
            return input
        }
        val inputs = input.get("inputs")
        if (!inputs.isObject) {
            return input
        }
        val keys = inputs.fieldNames().asSequence().toList()
        if (keys.size == 1) {
            return inputs.get(keys[0])
        }
        // Когда нет upstream-нод (inputs пуст), используем runInput если есть
        if (keys.isEmpty() && input.has("runInput")) {
            return input.get("runInput")
        }
        return input
    }

    private fun toArray(node: JsonNode): ArrayNode {
        if (node.isArray) {
            return node as ArrayNode
        }
        if (node.isNull) {
            return objectMapper.createArrayNode()
        }
        return objectMapper.createArrayNode().add(node)
    }
}
