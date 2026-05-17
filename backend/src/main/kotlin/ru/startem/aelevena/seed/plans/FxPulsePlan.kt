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
            purpose = "Кнопка «Запустить отсюда»: стартует весь пайплайн без расписания и без webhook'а.",
        )
        val fxToday = b.node(
            id = "fx-today",
            type = "http",
            x = 380.0, y = 80.0,
            label = "FX rates: today",
            purpose = "Тянет сегодняшние ECB-fixing курсы USD→{EUR,GBP,JPY,CNY,CHF,CAD,AUD,BRL,INR}.",
            inputsHint = "Не зависит от других нод — фиксированный URL frankfurter.dev/v1/latest.",
            config = b.httpConfig("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CNY,CHF,CAD,AUD,BRL,INR"),
        )
        val fxBaseline = b.node(
            id = "fx-30d",
            type = "http",
            x = 380.0, y = 320.0,
            label = "FX rates: 30 days ago",
            purpose = "Тянет те же курсы на 2026-04-18 — baseline для расчёта движения за 30 дней.",
            inputsHint = "Не зависит от других нод — фиксированная дата в URL.",
            config = b.httpConfig("https://api.frankfurter.dev/v1/2026-04-18?base=USD&symbols=EUR,GBP,JPY,CNY,CHF,CAD,AUD,BRL,INR"),
        )
        val analyze = b.node(
            id = "analyze",
            type = "javascript",
            x = 720.0, y = 200.0,
            label = "Classify movers → PM brief",
            purpose = "Сравнивает today vs baseline, классифицирует пары (stable/shift/major-move) " +
                "и формирует короткий брифинг для product manager'а.",
            inputsHint = "• inputs['fx-today'].body.rates — карта currency→rate сегодня\n" +
                "• inputs['fx-30d'].body.rates — та же карта на 30 дней назад\n" +
                "Из них же берётся inputs['fx-today'].body.date и inputs['fx-30d'].body.date " +
                "для подписей в отчёте.",
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
        /**
         * Output shape: { headline, summary, keyInsights[], actionItems[], report (md), details{} }.
         * Первые четыре поля — для PM'а; details — сырые цифры для аналитика/инженера.
         */
        private val ANALYZE_JS = """
            // Inputs:
            //   inputs['fx-today']: { body: { date, base, rates: { EUR, GBP, ... } } }
            //   inputs['fx-30d']:   { body: { date, base, rates: { EUR, GBP, ... } } }
            // Output: PM brief { headline, summary, keyInsights, actionItems, report, details }
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
                const majors = pairs.filter(function (p) { return p.label === 'major-move'; });
                const shifts = pairs.filter(function (p) { return p.label === 'shift'; });
                const top3 = pairs.slice(0, 3);

                const headline = majors.length > 0
                    ? '🚨 ' + majors.length + ' currency pair(s) moved more than 5% — review treasury exposure'
                    : (shifts.length > 0
                        ? '⚠️ ' + shifts.length + ' pair(s) shifted 2–5% — monitor positions'
                        : '✅ FX rates stable vs ' + past.date + ' (no pair moved more than 2%)');

                const summary = 'Out of ' + pairs.length + ' USD pairs: '
                    + majors.length + ' major-move, '
                    + shifts.length + ' shift, '
                    + (pairs.length - majors.length - shifts.length) + ' stable. '
                    + 'Today: ' + today.date + ', baseline: ' + past.date + '.';

                const keyInsights = top3.map(function (p) {
                    const dir = p.pctChange >= 0 ? 'up' : 'down';
                    return 'USD/' + p.currency + ' ' + dir + ' ' + Math.abs(p.pctChange) + '% vs ' + past.date + ' — ' + p.label;
                });

                const actionItems = majors.length > 0
                    ? majors.map(function (p) { return 'Review hedges and forward contracts on USD/' + p.currency; })
                    : (shifts.length > 0 ? ['Monitor shifted pairs at next morning FX sync'] : ['No action — FX desk can stand down']);

                const reportLines = [
                    '## FX Pulse — ' + today.date,
                    '',
                    headline,
                    '',
                    '**Summary.** ' + summary,
                    '',
                    '### Top movers (USD base)',
                    '| Pair | Today | ' + past.date + ' | Δ% | Bucket |',
                    '|---|---:|---:|---:|---|',
                ];
                pairs.forEach(function (p) {
                    reportLines.push('| USD/' + p.currency + ' | ' + p.today + ' | ' + p.baseline + ' | ' + p.pctChange + '% | ' + p.label + ' |');
                });
                if (actionItems.length > 0) {
                    reportLines.push('');
                    reportLines.push('### Action items');
                    actionItems.forEach(function (a) { reportLines.push('- ' + a); });
                }
                const report = reportLines.join('\n');

                return {
                    headline: headline,
                    summary: summary,
                    keyInsights: keyInsights,
                    actionItems: actionItems,
                    report: report,
                    details: {
                        asOfDate: today.date,
                        baselineDate: past.date,
                        pairCount: pairs.length,
                        majorMoveAlerts: majors.length,
                        shiftAlerts: shifts.length,
                        topMovers: top3,
                        allPairs: pairs,
                    },
                };
            }
        """.trimIndent()
    }
}
