package ru.startem.aelevena.triggers

import org.springframework.scheduling.support.CronExpression

/**
 * Принимаем и привычный 5-полевой Unix-cron (min hour dom mon dow), и нативный Spring 6-полевой
 * (sec min hour dom mon dow). 5-полевой нормализуется в 6-полевой подстановкой "0 " (запуск в 00 секунд).
 *
 * Также пропускаем макросы Spring (@hourly, @daily, ...) и расширения вида `*\/N` без изменений —
 * валидация делается через [CronExpression.parse], сама же возвращаемая строка — это то, что мы
 * храним в DB и потом передаём в `CronTrigger`.
 *
 * Если выражение невалидно — кидаем [IllegalArgumentException] с человекочитаемым сообщением;
 * вызовы из [TriggerService.validateConfig] оборачивают это в `BadRequestException`, чтобы юзер
 * увидел ошибку синхронно в ответе сохранения графа, а не получил тихий no-op после коммита.
 */
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
