package ru.startem.aelevena.triggers

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class CronExpressionsTest {

    @Test
    fun `5-field unix cron is normalized by prepending zero seconds`() {
        assertEquals("0 */5 * * * *", CronExpressions.normalize("*/5 * * * *"))
        assertEquals("0 0 * * * *", CronExpressions.normalize("0 * * * *"))
        assertEquals("0 0 12 * * MON", CronExpressions.normalize("0 12 * * MON"))
    }

    @Test
    fun `6-field spring cron is returned unchanged`() {
        assertEquals("0 */5 * * * *", CronExpressions.normalize("0 */5 * * * *"))
        assertEquals("30 0 12 * * *", CronExpressions.normalize("30 0 12 * * *"))
    }

    @Test
    fun `macros are passed through unchanged`() {
        assertEquals("@hourly", CronExpressions.normalize("@hourly"))
        assertEquals("@daily", CronExpressions.normalize("@daily"))
    }

    @Test
    fun `extra surrounding whitespace is trimmed`() {
        assertEquals("0 */5 * * * *", CronExpressions.normalize("  */5  *  *  *  *  "))
    }

    @Test
    fun `empty expression rejected`() {
        assertThrows(IllegalArgumentException::class.java) { CronExpressions.normalize("") }
        assertThrows(IllegalArgumentException::class.java) { CronExpressions.normalize("   ") }
    }

    @Test
    fun `expression with wrong number of fields rejected`() {
        assertThrows(IllegalArgumentException::class.java) { CronExpressions.normalize("* * *") }
        assertThrows(IllegalArgumentException::class.java) { CronExpressions.normalize("* * * * * * *") }
    }

    @Test
    fun `expression with invalid field rejected`() {
        assertThrows(IllegalArgumentException::class.java) { CronExpressions.normalize("not-a-cron expr here yes") }
        assertThrows(IllegalArgumentException::class.java) { CronExpressions.normalize("99 * * * *") }
    }
}
