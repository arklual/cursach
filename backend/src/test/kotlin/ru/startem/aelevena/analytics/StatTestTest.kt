package ru.startem.aelevena.analytics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import kotlin.math.abs

class StatTestTest {
    private fun assertNear(expected: Double, actual: Double, eps: Double = 1e-3) {
        assert(abs(expected - actual) < eps) { "expected $expected, got $actual (diff=${abs(expected - actual)})" }
    }

    @Test
    fun `normalCdf returns 0_5 at 0`() {
        assertNear(0.5, StatTest.normalCdf(0.0))
    }

    @Test
    fun `normalCdf at 1_96 is about 0_975`() {
        assertNear(0.975, StatTest.normalCdf(1.96))
    }

    @Test
    fun `normalCdf at minus 1_96 is about 0_025`() {
        assertNear(0.025, StatTest.normalCdf(-1.96))
    }

    @Test
    fun `twoProportionZ returns p value 1_0 when proportions equal`() {
        val result = StatTest.twoProportionZ(succA = 50, nA = 100, succB = 50, nB = 100)
        assertEquals(0.0, result.z, 1e-9)
        assertNear(1.0, result.pValue!!)
    }

    @Test
    fun `twoProportionZ large difference gives p value below 0_001`() {
        val result = StatTest.twoProportionZ(succA = 90, nA = 100, succB = 50, nB = 100)
        assert(result.pValue!! < 0.001) { "expected p<0.001, got ${result.pValue}" }
        assert(abs(result.z) > 6.0) { "expected |z|>6, got ${result.z}" }
    }

    @Test
    fun `twoProportionZ classic 50 vs 60 of 100 returns p around 0_155`() {
        val result = StatTest.twoProportionZ(succA = 50, nA = 100, succB = 60, nB = 100)
        assertNear(0.155, result.pValue!!, 0.005)
    }

    @Test
    fun `twoProportionZ returns null pValue for zero sample`() {
        val result = StatTest.twoProportionZ(succA = 0, nA = 0, succB = 5, nB = 10)
        assertEquals(null, result.pValue)
    }

    @Test
    fun `waldCi for p_0_5 n_100 is around 0_402 to 0_598`() {
        val ci = StatTest.waldCi(successes = 50, total = 100, z = 1.96)
        assertNear(0.402, ci.low!!, 0.005)
        assertNear(0.598, ci.high!!, 0.005)
    }

    @Test
    fun `waldCi clips to 0_1 range for extreme proportions`() {
        val ci = StatTest.waldCi(successes = 100, total = 100, z = 1.96)
        assertEquals(1.0, ci.high)
    }

    @Test
    fun `waldCi returns null for zero n`() {
        val ci = StatTest.waldCi(successes = 0, total = 0, z = 1.96)
        assertEquals(null, ci.low)
        assertEquals(null, ci.high)
    }
}
