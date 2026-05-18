package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

/**
 * Логистика / field-ops: оценка погодных рисков по нескольким региональным хабам перед сменой.
 * Реальные данные: wttr.in (?format=j1) — публичный JSON-сервис без ключей.
 */
@Component
class WeatherRiskPlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "Logistics Weather Risk — Multi-Hub Operations Brief"
    override val description: String =
        "Сводный risk-score по погоде в четырёх логистических хабах (Москва, СПб, Казань, Новосибирск). " +
            "Считает композитный индекс из температуры, ветра и осадков, классифицирует low/medium/high " +
            "и сортирует хабы по рискам — готовая утренняя сводка для диспетчера. " +
            "Два альтернативных входа: ручной запуск и cron «каждое утро в 7:00»."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node(
            id = "start", type = "trigger.manual",
            x = 80.0, y = 200.0, label = "Manual run",
            purpose = "Запускает утренний прогон сводки по всем хабам.",
        )
        val cron = b.node(
            id = "cron", type = "trigger.cron",
            x = 80.0, y = 360.0, label = "Cron: 0 0 7 * * *",
            purpose = "Альтернативный вход — расписание «каждое утро в 7:00» для автоматической рассылки.",
            config = b.cronConfig(
                expression = "0 0 7 * * *",
                description = "Утренний запуск сводки для диспетчера в 07:00 по серверному TZ.",
            ),
        )
        val moscow = b.node(
            id = "w-moscow", type = "http",
            x = 380.0, y = 80.0, label = "Weather: Moscow",
            purpose = "Тянет текущую погоду + прогноз на сегодня по Москве.",
            inputsHint = "Не зависит от других нод — фиксированный URL wttr.in/Moscow.",
            config = b.httpConfig("https://wttr.in/Moscow?format=j1"),
        )
        val spb = b.node(
            id = "w-spb", type = "http",
            x = 380.0, y = 220.0, label = "Weather: Saint Petersburg",
            purpose = "Тянет погоду по СПб (тот же формат wttr.in).",
            inputsHint = "Не зависит от других нод — фиксированный URL wttr.in/Saint+Petersburg.",
            config = b.httpConfig("https://wttr.in/Saint+Petersburg?format=j1"),
        )
        val kazan = b.node(
            id = "w-kazan", type = "http",
            x = 380.0, y = 360.0, label = "Weather: Kazan",
            purpose = "Тянет погоду по Казани.",
            inputsHint = "Не зависит от других нод — фиксированный URL wttr.in/Kazan.",
            config = b.httpConfig("https://wttr.in/Kazan?format=j1"),
        )
        val nsk = b.node(
            id = "w-novosibirsk", type = "http",
            x = 380.0, y = 500.0, label = "Weather: Novosibirsk",
            purpose = "Тянет погоду по Новосибирску.",
            inputsHint = "Не зависит от других нод — фиксированный URL wttr.in/Novosibirsk.",
            config = b.httpConfig("https://wttr.in/Novosibirsk?format=j1"),
        )
        val score = b.node(
            id = "score", type = "javascript",
            x = 720.0, y = 280.0, label = "Risk score → dispatcher brief",
            purpose = "Считает risk-score по каждому городу и собирает утреннюю сводку для диспетчера.",
            inputsHint = "Для каждого города берёт:\n" +
                "• inputs['w-<city>'].body.current_condition[0].temp_C / windspeedKmph / weatherDesc[0].value\n" +
                "• inputs['w-<city>'].body.weather[0].hourly[0].precipMM\n" +
                "Города: w-moscow, w-spb, w-kazan, w-novosibirsk.",
            config = b.jsConfig(SCORE_JS),
        )

        return b.graph(
            nodes = listOf(trigger, cron, moscow, spb, kazan, nsk, score),
            edges = listOf(
                b.edge("start", "w-moscow"),
                b.edge("start", "w-spb"),
                b.edge("start", "w-kazan"),
                b.edge("start", "w-novosibirsk"),
                b.edge("cron", "w-moscow"),
                b.edge("cron", "w-spb"),
                b.edge("cron", "w-kazan"),
                b.edge("cron", "w-novosibirsk"),
                b.edge("w-moscow", "score"),
                b.edge("w-spb", "score"),
                b.edge("w-kazan", "score"),
                b.edge("w-novosibirsk", "score"),
            ),
        )
    }

    companion object {
        private val SCORE_JS = """
            // Inputs:
            //   inputs['w-<city>'].body.current_condition[0] / .weather[0] (wttr.in j1 schema)
            // Output: dispatcher brief { headline, summary, keyInsights, actionItems, report, details }
            async function run(input) {
                const sources = [
                    { key: 'w-moscow', city: 'Moscow' },
                    { key: 'w-spb', city: 'Saint Petersburg' },
                    { key: 'w-kazan', city: 'Kazan' },
                    { key: 'w-novosibirsk', city: 'Novosibirsk' },
                ];
                function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
                const cities = sources.map(function (s) {
                    const body = (input.inputs[s.key] || {}).body || {};
                    const cur = (body.current_condition || [])[0] || {};
                    const today = (body.weather || [])[0] || {};
                    const hour = (today.hourly || [])[0] || {};
                    const temp = num(cur.temp_C);
                    const wind = num(cur.windspeedKmph);
                    const precip = num(today.totalSnow_cm) * 10 + num(hour.precipMM);
                    const score = precip * 4 + Math.max(0, wind - 25) * 1.5 + Math.max(0, Math.abs(temp - 15) - 15) * 0.5;
                    let level = 'low';
                    if (score > 40) level = 'high';
                    else if (score > 20) level = 'medium';
                    return {
                        city: s.city,
                        temp_c: temp,
                        wind_kmph: wind,
                        precipitation_mm: Math.round(precip * 100) / 100,
                        score: Math.round(score * 100) / 100,
                        level: level,
                        headline: ((cur.weatherDesc || [{}])[0] || {}).value || null,
                    };
                });
                cities.sort(function (a, b) { return b.score - a.score; });
                const high = cities.filter(function (c) { return c.level === 'high'; });
                const medium = cities.filter(function (c) { return c.level === 'medium'; });

                const headline = high.length > 0
                    ? '🚨 ' + high.length + ' hub(s) at HIGH weather risk — escalate dispatch plan'
                    : (medium.length > 0
                        ? '⚠️ ' + medium.length + ' hub(s) at MEDIUM weather risk — keep ops on watch'
                        : '✅ All hubs in LOW-risk band — normal dispatch');

                const summary = 'Risk profile across ' + cities.length + ' hubs: '
                    + high.length + ' high, '
                    + medium.length + ' medium, '
                    + (cities.length - high.length - medium.length) + ' low. '
                    + 'Worst hub: ' + cities[0].city + ' (score ' + cities[0].score + ').';

                const keyInsights = cities.map(function (c) {
                    return c.city + ': ' + c.level.toUpperCase() + ' — ' + c.headline
                        + ' (' + c.temp_c + '°C, wind ' + c.wind_kmph + ' km/h, precip ' + c.precipitation_mm + ' mm)';
                });

                const actionItems = high.map(function (c) { return 'Escalate dispatch for ' + c.city + ' — consider rescheduling or extra vehicles'; })
                    .concat(medium.map(function (c) { return 'Watch ' + c.city + ' through the day'; }));
                if (actionItems.length === 0) {
                    actionItems.push('No mitigation required — proceed with standard schedule');
                }

                const reportLines = [
                    '## Logistics Weather Risk — morning brief',
                    '',
                    headline,
                    '',
                    '**Summary.** ' + summary,
                    '',
                    '### Hubs ranked by risk',
                    '| Hub | Level | Score | Temp | Wind | Precip | Conditions |',
                    '|---|---|---:|---:|---:|---:|---|',
                ];
                cities.forEach(function (c) {
                    reportLines.push('| ' + c.city + ' | ' + c.level + ' | ' + c.score + ' | '
                        + c.temp_c + '°C | ' + c.wind_kmph + ' km/h | ' + c.precipitation_mm + ' mm | '
                        + (c.headline || '') + ' |');
                });
                reportLines.push('');
                reportLines.push('### Action items');
                actionItems.forEach(function (a) { reportLines.push('- ' + a); });

                return {
                    headline: headline,
                    summary: summary,
                    keyInsights: keyInsights,
                    actionItems: actionItems,
                    report: reportLines.join('\n'),
                    details: {
                        evaluatedAt: new Date().toISOString(),
                        highRiskCount: high.length,
                        mediumRiskCount: medium.length,
                        cities: cities,
                    },
                };
            }
        """.trimIndent()
    }
}
