package ru.startem.aelevena.analytics

import io.swagger.v3.oas.annotations.media.Schema
import java.time.OffsetDateTime

@Schema(description = "Результат аналитики A/B-теста для конкретного узла сценария")
data class AbAnalyticsResponse(
    @get:Schema(description = "Идентификатор A/B-узла, по которому собрана аналитика", example = "ab-node-1")
    val abNodeId: String,
    @get:Schema(description = "Режим работы A/B-теста: pick — выбор одного варианта, split — распределение трафика", example = "split")
    val mode: String,
    @get:Schema(description = "Общее количество прохождений (запусков) через A/B-узел", example = "1000")
    val totalRuns: Int,
    @get:Schema(description = "Количество прохождений, исключённых из-за отсутствия назначенного варианта", example = "12")
    val excludedNoVariant: Int,
    @get:Schema(description = "Момент времени, когда была рассчитана аналитика")
    val computedAt: OffsetDateTime,
    @get:Schema(description = "Список вариантов A/B-теста со статистикой по каждому")
    val variants: List<AbVariantRow>,
    @get:Schema(description = "Список предупреждений, возникших при расчёте аналитики")
    val warnings: List<String>,
)

@Schema(description = "Статистика по одному варианту A/B-теста")
data class AbVariantRow(
    @get:Schema(description = "Ключ варианта (уникальный идентификатор внутри A/B-узла)", example = "A")
    val key: String,
    @get:Schema(description = "Отображаемое название варианта", example = "Вариант A")
    val label: String,
    @get:Schema(description = "Цвет варианта для отображения в интерфейсе", example = "#4CAF50")
    val color: String,
    @get:Schema(description = "Вес варианта при распределении трафика (для режима split)", example = "50")
    val weight: Int?,
    @get:Schema(description = "Количество прохождений, попавших на данный вариант", example = "500")
    val runs: Int,
    @get:Schema(description = "Количество трафика, назначенного на данный вариант", example = "500")
    val trafficCount: Int,
    @get:Schema(description = "Доля трафика данного варианта в процентах", example = "50.0")
    val trafficPct: Double,
    @get:Schema(description = "Количество конверсий по данному варианту")
    val conversions: Int?,
    @get:Schema(description = "Доля конверсий по данному варианту в процентах")
    val conversionPct: Double?,
    @get:Schema(description = "Нижняя граница доверительного интервала конверсии")
    val ciLow: Double?,
    @get:Schema(description = "Верхняя граница доверительного интервала конверсии")
    val ciHigh: Double?,
    @get:Schema(description = "Прирост (lift) конверсии относительно базового варианта")
    val liftVsBaseline: Double?,
    @get:Schema(description = "p-значение статистической значимости относительно базового варианта")
    val pValue: Double?,
    @get:Schema(description = "Признак того, что вариант является базовым (контрольным)", example = "true")
    val isBaseline: Boolean,
    @get:Schema(description = "Признак статистической значимости результата по данному варианту", example = "false")
    val isSignificant: Boolean,
)
