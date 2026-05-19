package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import java.util.zip.CRC32
import kotlin.random.Random

data class SplitVariant(val key: String, val label: String, val weight: Int)

data class AttributeRule(val variant: String, val field: String, val op: String, val value: JsonNode)

data class SplitContext(
    val strategy: String,
    val variants: List<SplitVariant>,
    val userIdField: String? = null,
    val salt: String? = null,
    val seed: Long? = null,
    val percentage: Int? = null,
    val rules: List<AttributeRule> = emptyList(),
    val defaultVariant: String? = null,
    val stratifyBy: String? = null,
) {
    val random: Random by lazy { seed?.let { Random(it) } ?: Random.Default }
}

object BranchSplitStrategies {
    fun assignVariant(item: JsonNode, ctx: SplitContext): String? {
        return when (ctx.strategy) {
            "random" -> assignRandom(ctx)
            "hash" -> assignHash(item, ctx)
            "modulo" -> assignModulo(item, ctx)
            "attribute" -> assignAttribute(item, ctx)
            "percentage" -> assignPercentage(item, ctx)
            "stratified" -> assignStratified(item, ctx)
            else -> throw IllegalArgumentException("unknown strategy '${ctx.strategy}'")
        }
    }

    private fun assignRandom(ctx: SplitContext): String {
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        var roll = ctx.random.nextInt(total)
        for (v in ctx.variants) {
            roll -= v.weight
            if (roll < 0) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun assignHash(item: JsonNode, ctx: SplitContext): String {
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        val userId = extractUserId(item, ctx)
        val bucket = (crc32("${ctx.salt ?: ""}|$userId") % total.toLong()).toInt()
        var acc = 0
        for (v in ctx.variants) {
            acc += v.weight
            if (bucket < acc) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun assignModulo(item: JsonNode, ctx: SplitContext): String {
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        val userId = extractUserId(item, ctx)
        val idHash = crc32(userId).toInt() and Int.MAX_VALUE
        val bucket = idHash % total
        var acc = 0
        for (v in ctx.variants) {
            acc += v.weight
            if (bucket < acc) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun assignAttribute(item: JsonNode, ctx: SplitContext): String? {
        for (rule in ctx.rules) {
            val left = item.get(rule.field) ?: continue
            if (matches(left, rule.op, rule.value)) {
                return rule.variant
            }
        }
        return ctx.defaultVariant
    }

    private fun assignPercentage(item: JsonNode, ctx: SplitContext): String {
        require(ctx.variants.size == 2) { "percentage requires exactly 2 variants" }
        val pct = ctx.percentage ?: throw IllegalArgumentException("percentage required")
        require(pct in 0..100) { "percentage must be 0..100" }
        val userId = extractUserId(item, ctx)
        val bucket = (crc32("${ctx.salt ?: ""}|$userId") % 100L).toInt()
        return if (bucket < pct) ctx.variants[0].key else ctx.variants[1].key
    }

    private fun assignStratified(item: JsonNode, ctx: SplitContext): String {
        require(!ctx.stratifyBy.isNullOrBlank()) { "stratifyBy required" }
        val stratum = item.get(ctx.stratifyBy)?.asText() ?: ""
        val total = ctx.variants.sumOf { it.weight }
        require(total > 0) { "sum of weights must be > 0" }
        val userId = extractUserId(item, ctx)
        val bucket = (crc32("${ctx.salt ?: ""}|$stratum|$userId") % total.toLong()).toInt()
        var acc = 0
        for (v in ctx.variants) {
            acc += v.weight
            if (bucket < acc) {
                return v.key
            }
        }
        return ctx.variants.last().key
    }

    private fun extractUserId(item: JsonNode, ctx: SplitContext): String {
        val field = ctx.userIdField
        require(!field.isNullOrBlank()) { "userIdField required for strategy '${ctx.strategy}'" }
        val v = item.get(field) ?: throw IllegalArgumentException("missing userIdField '$field' in item")
        return v.asText()
    }

    private fun crc32(s: String): Long {
        val crc = CRC32()
        crc.update(s.toByteArray(Charsets.UTF_8))
        return crc.value
    }

    private fun matches(left: JsonNode, op: String, right: JsonNode): Boolean {
        return when (op) {
            "eq" -> left.asText() == right.asText()
            "ne" -> left.asText() != right.asText()
            "in" -> right.isArray && right.any { it.asText() == left.asText() }
            "gt" -> left.isNumber && right.isNumber && left.asDouble() > right.asDouble()
            "gte" -> left.isNumber && right.isNumber && left.asDouble() >= right.asDouble()
            "lt" -> left.isNumber && right.isNumber && left.asDouble() < right.asDouble()
            "lte" -> left.isNumber && right.isNumber && left.asDouble() <= right.asDouble()
            else -> throw IllegalArgumentException("unknown op '$op'")
        }
    }
}
