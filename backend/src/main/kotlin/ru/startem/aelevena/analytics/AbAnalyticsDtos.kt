package ru.startem.aelevena.analytics

import java.time.OffsetDateTime

data class AbAnalyticsResponse(
    val abNodeId: String,
    val mode: String,                 // "pick" | "split"
    val totalRuns: Int,
    val excludedNoVariant: Int,
    val computedAt: OffsetDateTime,
    val variants: List<AbVariantRow>,
    val warnings: List<String>,
)

data class AbVariantRow(
    val key: String,
    val label: String,
    val color: String,
    val weight: Int?,
    val runs: Int,
    val trafficCount: Int,
    val trafficPct: Double,
    val conversions: Int?,
    val conversionPct: Double?,
    val ciLow: Double?,
    val ciHigh: Double?,
    val liftVsBaseline: Double?,
    val pValue: Double?,
    val isBaseline: Boolean,
    val isSignificant: Boolean,
)
