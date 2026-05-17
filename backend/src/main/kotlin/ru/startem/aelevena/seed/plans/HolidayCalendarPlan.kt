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
            "Полезно при планировании рассылок, поставок, дежурств и SLA-окон через границы юрисдикций."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node("start", "trigger.manual", 80.0, 320.0, "Manual run")
        val de = b.node("h-de", "http", 380.0, 80.0, "Holidays: DE", b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/DE"))
        val us = b.node("h-us", "http", 380.0, 200.0, "Holidays: US", b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/US"))
        val jp = b.node("h-jp", "http", 380.0, 320.0, "Holidays: JP", b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/JP"))
        val gb = b.node("h-gb", "http", 380.0, 440.0, "Holidays: GB", b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/GB"))
        val br = b.node("h-br", "http", 380.0, 560.0, "Holidays: BR", b.httpConfig("https://date.nager.at/api/v3/PublicHolidays/2026/BR"))
        val consolidate = b.node(
            "consolidate", "javascript", 720.0, 320.0, "Next-60-days digest",
            b.jsConfig(CONSOLIDATE_JS),
        )

        return b.graph(
            nodes = listOf(trigger, de, us, jp, gb, br, consolidate),
            edges = listOf(
                b.edge("start", "h-de"),
                b.edge("start", "h-us"),
                b.edge("start", "h-jp"),
                b.edge("start", "h-gb"),
                b.edge("start", "h-br"),
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
            async function run(input) {
                const sources = [
                    { key: 'h-de', country: 'DE' },
                    { key: 'h-us', country: 'US' },
                    { key: 'h-jp', country: 'JP' },
                    { key: 'h-gb', country: 'GB' },
                    { key: 'h-br', country: 'BR' },
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

                return {
                    horizonDays: 60,
                    totalUpcoming: upcoming.length,
                    byCountry: byCountry,
                    multiCountryDates: collisions,
                    next5: upcoming.slice(0, 5),
                    upcoming: upcoming,
                };
            }
        """.trimIndent()
    }
}
