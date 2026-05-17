package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

/**
 * Sales / BD: моментальный country-dossier для проработки нового рынка.
 * Реальные данные:
 *   - restcountries.com — страновые факты без ключей.
 *   - date.nager.at — ближайшие гос-праздники без ключей.
 *   - en.wikipedia.org REST summary — текстовая сводка без ключей.
 *
 * countryCode зашит в URL ноды (DE). Sales-аналитик может склонировать workflow для другой
 * страны и поменять три URL — структура графа и downstream-логика остаются прежними.
 */
@Component
class CountryDossierPlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "Country Sales Dossier — Instant Market Profile"
    override val description: String =
        "Sales/BD-дossier: за один прогон собирает страновой профиль (RESTCountries) + ближайшие " +
            "гос-праздники (Nager.Date) + текстовую справку Wikipedia в единый JSON, готовый к " +
            "вставке в CRM или Notion. Шаблон: Germany — клонируйте и поменяйте country-code в URL."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node("start", "trigger.manual", 80.0, 240.0, "Manual run")
        val country = b.node(
            "country", "http", 380.0, 80.0, "Country facts (RESTCountries)",
            b.httpConfig(
                "https://restcountries.com/v3.1/alpha/DE" +
                    "?fields=name,capital,region,subregion,population,languages,currencies," +
                    "area,timezones,borders,maps,car",
            ),
        )
        val holidays = b.node(
            "holidays", "http", 380.0, 220.0, "Next public holidays",
            b.httpConfig("https://date.nager.at/api/v3/NextPublicHolidays/DE"),
        )
        val summary = b.node(
            "summary", "http", 380.0, 360.0, "Wikipedia summary",
            b.httpConfig("https://en.wikipedia.org/api/rest_v1/page/summary/Germany"),
        )
        val dossier = b.node(
            "dossier", "javascript", 720.0, 240.0, "Compile dossier",
            b.jsConfig(DOSSIER_JS),
        )

        return b.graph(
            nodes = listOf(trigger, country, holidays, summary, dossier),
            edges = listOf(
                b.edge("start", "country"),
                b.edge("start", "holidays"),
                b.edge("start", "summary"),
                b.edge("country", "dossier"),
                b.edge("holidays", "dossier"),
                b.edge("summary", "dossier"),
            ),
        )
    }

    companion object {
        private val DOSSIER_JS = """
            async function run(input) {
                const raw = (input.inputs.country || {}).body;
                const country = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
                const holidays = (input.inputs.holidays || {}).body || [];
                const summary = (input.inputs.summary || {}).body || {};

                const currencies = country.currencies ? Object.keys(country.currencies).map(function (k) {
                    const c = country.currencies[k] || {};
                    return { code: k, name: c.name, symbol: c.symbol };
                }) : [];
                const languages = country.languages ? Object.keys(country.languages).map(function (k) {
                    return country.languages[k];
                }) : [];
                const next5 = (Array.isArray(holidays) ? holidays : []).slice(0, 5).map(function (h) {
                    return { date: h.date, name: h.name, localName: h.localName, types: h.types };
                });

                return {
                    countryCode: country.cca2 || 'DE',
                    name: country.name && country.name.common,
                    officialName: country.name && country.name.official,
                    capital: country.capital ? country.capital[0] : null,
                    region: country.region,
                    subregion: country.subregion,
                    population: country.population,
                    area_km2: country.area,
                    languages: languages,
                    currencies: currencies,
                    timezones: country.timezones,
                    borderingCountries: country.borders || [],
                    drivingSide: country.car ? country.car.side : null,
                    mapUrl: country.maps ? country.maps.googleMaps : null,
                    summary: summary.extract || null,
                    wikipediaUrl: summary.content_urls && summary.content_urls.desktop
                        ? summary.content_urls.desktop.page : null,
                    nextHolidays: next5,
                };
            }
        """.trimIndent()
    }
}
