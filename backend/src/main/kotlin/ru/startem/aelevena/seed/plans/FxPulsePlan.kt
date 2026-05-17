package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

/**
 * Treasury FX-monitoring: дневной снапшот основных пар USD vs G10/EM + сравнение с месяцем назад.
 * Реальные данные: frankfurter.dev — публичный API ECB-fixing-rates без ключей.
 */
@Component
class FxPulsePlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "FX Pulse — Daily Currency Risk Monitor"
    override val description: String =
        "Treasury-grade FX exposure check across G10/EM pairs. Сравнивает сегодняшние курсы " +
            "(frankfurter.dev — ECB reference) с курсами 30 дней назад, классифицирует движение " +
            "(stable / shift / major-move) и подсвечивает топ-3 мувера + общее число алертов."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node(
            id = "start",
            type = "trigger.manual",
            x = 80.0, y = 200.0,
            label = "Manual run",
        )
        val fxToday = b.node(
            id = "fx-today",
            type = "http",
            x = 380.0, y = 80.0,
            label = "FX today (USD base)",
            config = b.httpConfig("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CNY,CHF,CAD,AUD,BRL,INR"),
        )
        val fxBaseline = b.node(
            id = "fx-30d",
            type = "http",
            x = 380.0, y = 320.0,
            label = "FX baseline (30d ago)",
            config = b.httpConfig("https://api.frankfurter.dev/v1/2026-04-18?base=USD&symbols=EUR,GBP,JPY,CNY,CHF,CAD,AUD,BRL,INR"),
        )
        val analyze = b.node(
            id = "analyze",
            type = "javascript",
            x = 720.0, y = 200.0,
            label = "Classify movers",
            config = b.jsConfig(ANALYZE_JS),
        )

        return b.graph(
            nodes = listOf(trigger, fxToday, fxBaseline, analyze),
            edges = listOf(
                b.edge("start", "fx-today"),
                b.edge("start", "fx-30d"),
                b.edge("fx-today", "analyze"),
                b.edge("fx-30d", "analyze"),
            ),
        )
    }

    companion object {
        private val ANALYZE_JS = """
            async function run(input) {
                const today = input.inputs['fx-today'].body;
                const past = input.inputs['fx-30d'].body;
                const rates = today.rates || {};
                const baseline = past.rates || {};
                const pairs = Object.keys(rates).map(function (ccy) {
                    const t = rates[ccy];
                    const b = baseline[ccy];
                    const pct = b ? ((t - b) / b) * 100 : 0;
                    let label = 'stable';
                    if (Math.abs(pct) > 5) label = 'major-move';
                    else if (Math.abs(pct) > 2) label = 'shift';
                    return {
                        currency: ccy,
                        base: today.base,
                        today: t,
                        baseline: b,
                        pctChange: Math.round(pct * 100) / 100,
                        label: label,
                    };
                });
                pairs.sort(function (a, b) { return Math.abs(b.pctChange) - Math.abs(a.pctChange); });
                const alerts = pairs.filter(function (p) { return p.label === 'major-move'; });
                return {
                    asOfDate: today.date,
                    baselineDate: past.date,
                    pairCount: pairs.length,
                    majorMoveAlerts: alerts.length,
                    topMovers: pairs.slice(0, 3),
                    allPairs: pairs,
                };
            }
        """.trimIndent()
    }
}
