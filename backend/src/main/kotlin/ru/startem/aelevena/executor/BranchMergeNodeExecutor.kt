package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Component

@Component
class BranchMergeNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "branch.merge"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val tagField = config?.get("tagField")?.asText()?.takeIf { it.isNotBlank() } ?: "_variant"
        val preserveExistingTag = config?.get("preserveExistingTag")?.asBoolean() ?: true
        val sourceVariants: Map<String, String> = config?.get("sourceVariants")
            ?.takeIf { it.isObject }
            ?.fields()?.asSequence()
            ?.associate { it.key to it.value.asText() }
            .orEmpty()

        val inputs = input.get("inputs")
        require(inputs != null && inputs.isObject) { "branch.merge expects envelope with inputs object" }

        val inputVariants: Map<String, String> = input.get("inputVariants")
            ?.takeIf { it.isObject }
            ?.fields()?.asSequence()
            ?.associate { it.key to it.value.asText() }
            .orEmpty()

        val out: ArrayNode = objectMapper.createArrayNode()
        inputs.fields().forEachRemaining { (depId, depOutput) ->
            if (depOutput == null || depOutput.isNull) {
                return@forEachRemaining
            }
            val variant: String? = sourceVariants[depId] ?: inputVariants[depId]
            val items = toArray(depOutput)
            for (item in items) {
                val tagged = applyTag(item, variant, tagField, preserveExistingTag)
                out.add(tagged)
            }
        }
        return out
    }

    private fun applyTag(item: JsonNode, variant: String?, tagField: String, preserveExisting: Boolean): JsonNode {
        if (variant == null) {
            return item
        }
        if (!item.isObject) {
            return item
        }
        val copy = item.deepCopy<ObjectNode>()
        if (preserveExisting && copy.has(tagField) && !copy.get(tagField).isNull) {
            return copy
        }
        copy.put(tagField, variant)
        return copy
    }

    private fun toArray(node: JsonNode): ArrayNode {
        if (node.isArray) {
            return node as ArrayNode
        }
        return objectMapper.createArrayNode().add(node)
    }
}
