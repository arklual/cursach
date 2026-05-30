package ru.startem.aelevena.triggers

import org.springframework.scheduling.support.CronExpression

object CronExpressions {

    fun normalize(raw: String): String {
        val trimmed = raw.trim()
        require(trimmed.isNotEmpty()) { "Cron expression is empty" }

        val candidate = if (trimmed.startsWith("@")) {
            trimmed
        } else {
            val fields = trimmed.split(Regex("\\s+"))
            when (fields.size) {
                6 -> trimmed
                5 -> "0 " + fields.joinToString(" ")
                else -> throw IllegalArgumentException(
                    "Cron expression must have 5 or 6 fields, got ${fields.size}: '$raw'",
                )
            }
        }

        try {
            CronExpression.parse(candidate)
        } catch (ex: IllegalArgumentException) {
            throw IllegalArgumentException(
                "Invalid cron expression '$raw' (normalized: '$candidate'): ${ex.message}",
                ex,
            )
        }
        return candidate
    }
}
