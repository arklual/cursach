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
            "и сортирует хабы по рискам — готовая утренняя сводка для диспетчера."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node("start", "trigger.manual", 80.0, 280.0, "Manual run")
        val moscow = b.node(
            "w-moscow", "http", 380.0, 80.0, "Weather: Moscow",
            b.httpConfig("https://wttr.in/Moscow?format=j1"),
        )
        val spb = b.node(
            "w-spb", "http", 380.0, 220.0, "Weather: SPb",
            b.httpConfig("https://wttr.in/Saint+Petersburg?format=j1"),
        )
        val kazan = b.node(
            "w-kazan", "http", 380.0, 360.0, "Weather: Kazan",
            b.httpConfig("https://wttr.in/Kazan?format=j1"),
        )
        val nsk = b.node(
            "w-novosibirsk", "http", 380.0, 500.0, "Weather: Novosibirsk",
            b.httpConfig("https://wttr.in/Novosibirsk?format=j1"),
        )
        val score = b.node(
            "score", "javascript", 720.0, 280.0, "Risk scoring",
            b.jsConfig(SCORE_JS),
        )

        return b.graph(
            nodes = listOf(trigger, moscow, spb, kazan, nsk, score),
            edges = listOf(
                b.edge("start", "w-moscow"),
                b.edge("start", "w-spb"),
                b.edge("start", "w-kazan"),
                b.edge("start", "w-novosibirsk"),
                b.edge("w-moscow", "score"),
                b.edge("w-spb", "score"),
                b.edge("w-kazan", "score"),
                b.edge("w-novosibirsk", "score"),
            ),
        )
    }

    companion object {
        private val SCORE_JS = """
            async function run(input) {
                const sources = [
                    { key: 'w-moscow', city: 'Moscow' },
                    { key: 'w-spb', city: 'Saint Petersburg' },
                    { key: 'w-kazan', city: 'Kazan' },
                    { key: 'w-novosibirsk', city: 'Novosibirsk' },
                ];
                function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
                const result = sources.map(function (s) {
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
                        precipitation_mm: precip,
                        score: Math.round(score * 100) / 100,
                        level: level,
                        headline: (cur.weatherDesc || [{}])[0].value || null,
                    };
                });
                result.sort(function (a, b) { return b.score - a.score; });
                return {
                    evaluatedAt: new Date().toISOString(),
                    highRiskCount: result.filter(function (r) { return r.level === 'high'; }).length,
                    cities: result,
                };
            }
        """.trimIndent()
    }
}
