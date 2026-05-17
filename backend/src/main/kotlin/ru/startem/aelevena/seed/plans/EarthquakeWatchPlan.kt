package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

/**
 * Insurance / GIS / public-safety: оперативная сводка значимых землетрясений недели.
 * Реальные данные: earthquake.usgs.gov — публичный GeoJSON-фид USGS (значимые события за 7 дней).
 *
 * Цепочка демонстрирует связку: HTTP → JS (нормализация и фильтр) → Python (агрегация и top-N).
 */
@Component
class EarthquakeWatchPlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "Earthquake Early-Watch — USGS Significant Events Brief"
    override val description: String =
        "Сводка значимых землетрясений за последние 7 дней по GeoJSON-фиду USGS. " +
            "Нормализует геометрию + properties, оставляет M ≥ 5.0, агрегирует по магнитудным " +
            "коридорам и регионам — готово для GIS-дешборда / страхового мониторинга."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node(
            id = "start", type = "trigger.manual",
            x = 80.0, y = 240.0, label = "Manual run",
            purpose = "Запускает прогон сводки по USGS GeoJSON.",
        )
        val feed = b.node(
            id = "feed", type = "http",
            x = 380.0, y = 240.0, label = "USGS GeoJSON: significant week",
            purpose = "Тянет публичный USGS-фид значимых землетрясений за последние 7 дней.",
            inputsHint = "Не зависит от других нод — фиксированный URL " +
                "earthquake.usgs.gov/.../summary/significant_week.geojson.",
            config = b.httpConfig(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
                timeoutMs = 45_000L,
            ),
        )
        val extract = b.node(
            id = "extract", type = "javascript",
            x = 720.0, y = 240.0, label = "Normalize + filter M≥5",
            purpose = "Превращает GeoJSON в плоский массив событий и оставляет только M ≥ 5.0.",
            inputsHint = "Принимает inputs.feed.body — GeoJSON FeatureCollection " +
                "({ type, metadata.title, features: [{ id, properties{mag,place,time,url,...}, geometry.coordinates }] }).",
            config = b.jsConfig(EXTRACT_JS),
        )
        val report = b.node(
            id = "report", type = "python",
            x = 1060.0, y = 240.0, label = "Aggregate → PM brief",
            purpose = "Считает агрегаты (магнитудные коридоры, top-регионы, top-5 событий) и " +
                "оформляет PM-сводку для дешборда / страховщика.",
            inputsHint = "Принимает payload.inputs.extract — объект от предыдущей ноды:\n" +
                "  { evaluatedAt, feedTitle, totalEvents, majorCount, majorEvents: [{ id, mag, place, " +
                "time_iso, depth_km, longitude, latitude, url, tsunami, felt, alert, type }] }.",
            config = b.pyConfig(REPORT_PY),
        )

        return b.graph(
            nodes = listOf(trigger, feed, extract, report),
            edges = listOf(
                b.edge("start", "feed"),
                b.edge("feed", "extract"),
                b.edge("extract", "report"),
            ),
        )
    }

    companion object {
        private val EXTRACT_JS = """
            // Input:  inputs.feed.body — GeoJSON FeatureCollection
            // Output: { evaluatedAt, feedTitle, totalEvents, majorCount, majorEvents[] }
            async function run(input) {
                const body = (input.inputs.feed || {}).body || {};
                const features = body.features || [];
                const events = features.map(function (f) {
                    const p = f.properties || {};
                    const g = f.geometry || {};
                    const coords = g.coordinates || [null, null, null];
                    return {
                        id: f.id,
                        mag: p.mag,
                        place: p.place,
                        time_iso: p.time ? new Date(p.time).toISOString() : null,
                        depth_km: coords[2],
                        longitude: coords[0],
                        latitude: coords[1],
                        url: p.url,
                        tsunami: p.tsunami === 1,
                        felt: p.felt,
                        alert: p.alert || null,
                        type: p.type,
                    };
                });
                const major = events.filter(function (e) { return e.mag != null && e.mag >= 5.0; });
                major.sort(function (a, b) { return b.mag - a.mag; });
                return {
                    evaluatedAt: new Date().toISOString(),
                    feedTitle: (body.metadata || {}).title || null,
                    totalEvents: events.length,
                    majorCount: major.length,
                    majorEvents: major,
                };
            }
        """.trimIndent()

        private val REPORT_PY = """
            # Input:  payload.inputs.extract — { feedTitle, totalEvents, majorCount, majorEvents[], evaluatedAt }
            # Output: PM brief { headline, summary, keyInsights, actionItems, report (md), details{...} }
            def run(payload):
                inputs = (payload or {}).get('inputs') or {}
                raw = inputs.get('extract') or {}
                events = raw.get('majorEvents') or []
                bands = {'M>=7': 0, 'M>=6': 0, 'M>=5': 0}
                by_region = {}
                tsunamis = 0
                for e in events:
                    m = e.get('mag') or 0
                    if m >= 7: bands['M>=7'] += 1
                    if m >= 6: bands['M>=6'] += 1
                    if m >= 5: bands['M>=5'] += 1
                    if e.get('tsunami'):
                        tsunamis += 1
                    place = e.get('place') or ''
                    region = place.split(',')[-1].strip() if place else 'unknown'
                    by_region[region] = by_region.get(region, 0) + 1
                top_regions = sorted(by_region.items(), key=lambda kv: -kv[1])[:5]
                top5 = sorted(events, key=lambda e: -(e.get('mag') or 0))[:5]

                if bands['M>=7'] > 0:
                    headline = '🚨 ' + str(bands['M>=7']) + ' major (M≥7) event(s) this week — escalate response'
                elif bands['M>=6'] > 0:
                    headline = '⚠️ ' + str(bands['M>=6']) + ' strong (M≥6) event(s) this week — monitor closely'
                elif bands['M>=5'] > 0:
                    headline = '🟡 ' + str(bands['M>=5']) + ' moderate (M≥5) event(s) — routine monitoring'
                else:
                    headline = '✅ No significant earthquakes M≥5 in the last 7 days'

                summary = 'Significant events: ' + str(len(events)) + '. '
                summary += 'Bands: M≥7=' + str(bands['M>=7']) + ', M≥6=' + str(bands['M>=6']) + ', M≥5=' + str(bands['M>=5']) + '. '
                summary += 'Tsunami flags: ' + str(tsunamis) + '. '
                summary += 'Top region: ' + (top_regions[0][0] if top_regions else 'n/a') + '.'

                key_insights = []
                for e in top5:
                    mag = e.get('mag') or 0
                    place = e.get('place') or 'unknown'
                    when = e.get('time_iso') or ''
                    key_insights.append('M' + str(mag) + ' — ' + place + ' (' + when + ')')
                if not key_insights:
                    key_insights.append('No M≥5 events in window')

                actions = []
                if bands['M>=7'] > 0:
                    actions.append('Review insurance exposure in affected regions; notify GIS team')
                if tsunamis > 0:
                    actions.append('Check coastal-asset exposure — ' + str(tsunamis) + ' event(s) flagged for tsunami')
                for r, c in top_regions[:3]:
                    actions.append('Region "' + r + '" has ' + str(c) + ' event(s) — pull policy concentration')
                if not actions:
                    actions.append('No mitigation required this cycle')

                report_lines = []
                report_lines.append('## Earthquake Early-Watch — last 7 days')
                report_lines.append('')
                report_lines.append(headline)
                report_lines.append('')
                report_lines.append('**Summary.** ' + summary)
                report_lines.append('')
                report_lines.append('### Magnitude bands')
                report_lines.append('| Band | Count |')
                report_lines.append('|---|---:|')
                for band in ['M>=7', 'M>=6', 'M>=5']:
                    report_lines.append('| ' + band + ' | ' + str(bands[band]) + ' |')
                report_lines.append('')
                report_lines.append('### Top 5 events')
                report_lines.append('| Mag | Place | Time | Tsunami |')
                report_lines.append('|---:|---|---|---|')
                for e in top5:
                    report_lines.append('| ' + str(e.get('mag') or '?') + ' | ' + (e.get('place') or '—')
                        + ' | ' + (e.get('time_iso') or '—')
                        + ' | ' + ('yes' if e.get('tsunami') else 'no') + ' |')
                if top_regions:
                    report_lines.append('')
                    report_lines.append('### Top regions')
                    for r, c in top_regions:
                        report_lines.append('- ' + r + ': ' + str(c))
                report_lines.append('')
                report_lines.append('### Action items')
                for a in actions:
                    report_lines.append('- ' + a)

                return {
                    'headline': headline,
                    'summary': summary,
                    'keyInsights': key_insights,
                    'actionItems': actions,
                    'report': '\n'.join(report_lines),
                    'details': {
                        'feedTitle': raw.get('feedTitle'),
                        'totalSignificant': len(events),
                        'bandCounts': bands,
                        'tsunamiFlags': tsunamis,
                        'topRegions': [{'region': r, 'count': c} for r, c in top_regions],
                        'top5': top5,
                        'evaluatedAt': raw.get('evaluatedAt'),
                    },
                }
        """.trimIndent()
    }
}
