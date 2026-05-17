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
        val trigger = b.node("start", "trigger.manual", 80.0, 240.0, "Manual run")
        val feed = b.node(
            "feed", "http", 380.0, 240.0, "USGS significant_week",
            b.httpConfig(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
                timeoutMs = 45_000L,
            ),
        )
        val extract = b.node(
            "extract", "javascript", 720.0, 240.0, "Normalize + filter ≥ M5",
            b.jsConfig(EXTRACT_JS),
        )
        val report = b.node(
            "report", "python", 1060.0, 240.0, "Aggregate report",
            b.pyConfig(REPORT_PY),
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
            def run(payload):
                inputs = (payload or {}).get('inputs') or {}
                raw = inputs.get('extract') or {}
                events = raw.get('majorEvents') or []
                bands = {'>=7': 0, '>=6': 0, '>=5': 0}
                by_region = {}
                for e in events:
                    m = e.get('mag') or 0
                    if m >= 7: bands['>=7'] += 1
                    if m >= 6: bands['>=6'] += 1
                    if m >= 5: bands['>=5'] += 1
                    place = e.get('place') or ''
                    region = place.split(',')[-1].strip() if place else 'unknown'
                    by_region[region] = by_region.get(region, 0) + 1
                top_regions = sorted(by_region.items(), key=lambda kv: -kv[1])[:5]
                top5 = sorted(events, key=lambda e: -(e.get('mag') or 0))[:5]
                return {
                    'feedTitle': raw.get('feedTitle'),
                    'totalSignificant': len(events),
                    'bandCounts': bands,
                    'topRegions': [{'region': r, 'count': c} for r, c in top_regions],
                    'top5': top5,
                    'evaluatedAt': raw.get('evaluatedAt'),
                }
        """.trimIndent()
    }
}
