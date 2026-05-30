package ru.startem.aelevena.analytics

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sqrt

object StatTest {
    data class ZResult(val z: Double, val pValue: Double?)
    data class Ci(val low: Double?, val high: Double?)

    fun twoProportionZ(succA: Int, nA: Int, succB: Int, nB: Int): ZResult {
        if (nA == 0 || nB == 0) return ZResult(z = 0.0, pValue = null)
        val pA = succA.toDouble() / nA
        val pB = succB.toDouble() / nB
        val pooled = (succA + succB).toDouble() / (nA + nB)
        val se = sqrt(pooled * (1.0 - pooled) * (1.0 / nA + 1.0 / nB))
        if (se == 0.0) {
            return ZResult(z = 0.0, pValue = 1.0)
        }
        val z = (pB - pA) / se
        val pValue = 2.0 * (1.0 - normalCdf(abs(z)))
        return ZResult(z = z, pValue = pValue.coerceIn(0.0, 1.0))
    }

    fun waldCi(successes: Int, total: Int, z: Double = 1.96): Ci {
        if (total == 0) return Ci(low = null, high = null)
        val p = successes.toDouble() / total
        val half = z * sqrt(p * (1.0 - p) / total)
        return Ci(
            low = (p - half).coerceIn(0.0, 1.0),
            high = (p + half).coerceIn(0.0, 1.0),
        )
    }

    fun normalCdf(x: Double): Double {
        val a1 = 0.254829592
        val a2 = -0.284496736
        val a3 = 1.421413741
        val a4 = -1.453152027
        val a5 = 1.061405429
        val p = 0.3275911

        val sign = if (x < 0) -1.0 else 1.0
        val absX = abs(x) / sqrt(2.0)
        val t = 1.0 / (1.0 + p * absX)
        val y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * exp(-absX * absX)
        return 0.5 * (1.0 + sign * y)
    }
}
