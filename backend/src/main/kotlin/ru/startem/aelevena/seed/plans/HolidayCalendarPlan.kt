package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

/**
 * HR / payroll / supply-chain: сводный календарь государственных праздников по ключевым рынкам.
 * Реальные данные: date.nager.at — публичный API без ключей.
 */
@Component
class HolidayCalendarPlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "Public Holidays — Multi-Market Operations Calendar"
    override val description: String =
        "HR/Ops-сводка: пересечение государственных праздников в DE / US / JP / GB / BR на ближайшие 60 дней. " +
            "Полезно при планировании рассылок, поставок, дежурств и SLA-окон через границы юрисдикций. " +
            "Два входа — ручной запуск и interval «каждые 6 часов» для регулярного пере-snapshot'а."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node(
            id = "start", type = "trigger.manual",
            x = 80.0, y = 200.0, label = "Manual run",
            purpose = "Кнопка «Запустить» — собирает следующие 60 дней по 5 рынкам.",
        )
        val interval = b.node(
            id = "interval", type = "trigger.interval",
            x = 80.0, y = 440.0, label = "Interval: every 6h",
            purpose = "Альтернативный вход — авто-обновление снимка каждые 6 часов для длительных кампаний.",
            config = b.intervalConfig(
                seconds = 21_600L,
                description = "21600s = 6 часов между прогонами; снимок праздников редко меняется чаще.",
            ),
        )
        val de = b.node(
            id = "h-de", type = "http",
            x = 380.0, y = 80.0, label = "Holidays: Germany",
            purpose = "Список гос-праздников Германии за 2026 год.",
            inputsHint = "Не зависит от других нод — фиксированный URL Nager.Date /PublicHolidays/2026/DE.",
            config = b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/DE"),
        )
        val us = b.node(
            id = "h-us", type = "http",
            x = 380.0, y = 200.0, label = "Holidays: United States",
            purpose = "Список гос-праздников США за 2026 год.",
            inputsHint = "Не зависит от других нод — фиксированный URL Nager.Date /PublicHolidays/2026/US.",
            config = b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/US"),
        )
        val jp = b.node(
            id = "h-jp", type = "http",
            x = 380.0, y = 320.0, label = "Holidays: Japan",
            purpose = "Список гос-праздников Японии за 2026 год.",
            inputsHint = "Не зависит от других нод — фиксированный URL Nager.Date /PublicHolidays/2026/JP.",
            config = b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/JP"),
        )
        val gb = b.node(
            id = "h-gb", type = "http",
            x = 380.0, y = 440.0, label = "Holidays: United Kingdom",
            purpose = "Список гос-праздников Великобритании за 2026 год.",
            inputsHint = "Не зависит от других нод — фиксированный URL Nager.Date /PublicHolidays/2026/GB.",
            config = b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/GB"),
        )
        val br = b.node(
            id = "h-br", type = "http",
            x = 380.0, y = 560.0, label = "Holidays: Brazil",
            purpose = "Список гос-праздников Бразилии за 2026 год.",
            inputsHint = "Не зависит от других нод — фиксированный URL Nager.Date /PublicHolidays/2026/BR.",
            config = b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/BR"),
        )
        val consolidate = b.node(
            id = "consolidate", type = "javascript",
            x = 720.0, y = 320.0, label = "Next-60-days digest → PM brief",
            purpose = "Сводит праздники 5 стран, фильтрует ближайшие 60 дней и оформляет PM-сводку.",
            inputsHint = "Из каждой страновой ноды берёт inputs['h-<cc>'].body — массив объектов " +
                "{ date, name, localName, countryCode, types[], global }.\n" +
                "Источники: h-de, h-us, h-jp, h-gb, h-br.",
            config = b.jsConfig(CONSOLIDATE_JS),
        )

        return b.graph(
            nodes = listOf(trigger, interval, de, us, jp, gb, br, consolidate),
            edges = listOf(
                b.edge("start", "h-de"),
                b.edge("start", "h-us"),
                b.edge("start", "h-jp"),
                b.edge("start", "h-gb"),
                b.edge("start", "h-br"),
                b.edge("interval", "h-de"),
                b.edge("interval", "h-us"),
                b.edge("interval", "h-jp"),
                b.edge("interval", "h-gb"),
                b.edge("interval", "h-br"),
                b.edge("h-de", "consolidate"),
                b.edge("h-us", "consolidate"),
                b.edge("h-jp", "consolidate"),
                b.edge("h-gb", "consolidate"),
                b.edge("h-br", "consolidate"),
            ),
        )
    }

    companion object {
        private val CONSOLIDATE_JS = """
            // Inputs:
            //   inputs['h-<cc>'].body: [{ date, name, localName, types[], global, ... }]
            // Output: PM brief { headline, summary, keyInsights, actionItems, report, details }
            async function run(input) {
                const sources = [
                    { key: 'h-de', country: 'DE', label: 'Germany' },
                    { key: 'h-us', country: 'US', label: 'United States' },
                    { key: 'h-jp', country: 'JP', label: 'Japan' },
                    { key: 'h-gb', country: 'GB', label: 'United Kingdom' },
                    { key: 'h-br', country: 'BR', label: 'Brazil' },
                ];
                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);
                const horizon = new Date(today);
                horizon.setUTCDate(horizon.getUTCDate() + 60);

                const all = [];
                sources.forEach(function (s) {
                    const body = (input.inputs[s.key] || {}).body;
                    if (Array.isArray(body)) {
                        body.forEach(function (h) {
                            all.push({
                                date: h.date,
                                name: h.name,
                                localName: h.localName,
                                country: s.country,
                                countryLabel: s.label,
                                types: h.types || [],
                                global: h.global === true,
                            });
                        });
                    }
                });
                const upcoming = all.filter(function (h) {
                    const d = new Date(h.date + 'T00:00:00Z');
                    return d >= today && d <= horizon;
                });
                upcoming.sort(function (a, b) { return a.date.localeCompare(b.date); });

                const byCountry = {};
                const byDate = {};
                upcoming.forEach(function (h) {
                    byCountry[h.country] = (byCountry[h.country] || 0) + 1;
                    if (!byDate[h.date]) byDate[h.date] = [];
                    byDate[h.date].push(h.country);
                });
                const collisions = Object.keys(byDate)
                    .filter(function (d) { return byDate[d].length > 1; })
                    .map(function (d) { return { date: d, countries: byDate[d] }; });
                const next5 = upcoming.slice(0, 5);

                const headline = upcoming.length === 0
                    ? '✅ No public holidays in the next 60 days across DE / US / JP / GB / BR'
                    : (collisions.length > 0
                        ? '⚠️ ' + collisions.length + ' day(s) hit multiple markets — plan SLA windows and dispatches'
                        : '📅 ' + upcoming.length + ' public holiday(s) coming up — review staffing and shipping calendar');

                const summary = 'Window: next 60 days from ' + today.toISOString().slice(0, 10) + '. '
                    + 'Total upcoming: ' + upcoming.length + '. '
                    + 'Multi-country dates: ' + collisions.length + '. '
                    + 'By country: ' + Object.keys(byCountry).map(function (c) { return c + '=' + byCountry[c]; }).join(', ') + '.';

                const keyInsights = next5.map(function (h) {
                    return h.date + ' — ' + h.name + ' (' + h.countryLabel + ')';
                });
                if (next5.length === 0) {
                    keyInsights.push('No upcoming holidays in window');
                }

                const actionItems = [];
                collisions.slice(0, 5).forEach(function (c) {
                    actionItems.push('Plan around ' + c.date + ' — shared holiday in ' + c.countries.join(', '));
                });
                if (actionItems.length === 0) {
                    actionItems.push('No multi-country collisions — usual scheduling rules apply');
                }

                const reportLines = [
                    '## Holiday Calendar — next 60 days',
                    '',
                    headline,
                    '',
                    '**Summary.** ' + summary,
                    '',
                    '### Next 5 holidays',
                    '| Date | Holiday | Country |',
                    '|---|---|---|',
                ];
                next5.forEach(function (h) {
                    reportLines.push('| ' + h.date + ' | ' + h.name + ' | ' + h.countryLabel + ' |');
                });
                if (collisions.length > 0) {
                    reportLines.push('');
                    reportLines.push('### Multi-country dates');
                    collisions.forEach(function (c) {
                        reportLines.push('- ' + c.date + ' — ' + c.countries.join(', '));
                    });
                }
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
                        horizonDays: 60,
                        totalUpcoming: upcoming.length,
                        byCountry: byCountry,
                        multiCountryDates: collisions,
                        next5: next5,
                        upcoming: upcoming,
                    },
                };
            }
        """.trimIndent()
    }
}
