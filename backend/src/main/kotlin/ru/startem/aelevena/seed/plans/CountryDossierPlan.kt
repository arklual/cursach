package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

@Component
class CountryDossierPlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "Country Sales Dossier — Instant Market Profile"
    override val description: String =
        "Sales/BD-дossier: за один прогон собирает страновой профиль (RESTCountries) + ближайшие " +
            "гос-праздники (Nager.Date) + текстовую справку Wikipedia в единый JSON, готовый к " +
            "вставке в CRM или Notion. Шаблон: Germany — клонируйте и поменяйте country-code в URL."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node(
            id = "start", type = "trigger.manual",
            x = 80.0, y = 240.0, label = "Manual run",
            purpose = "Запускает сборку dossier для текущей страны (зашита Germany в URL'ах нод ниже).",
        )
        val country = b.node(
            id = "country", type = "http",
            x = 380.0, y = 80.0, label = "Country facts (RESTCountries)",
            purpose = "Тянет страновой профиль: столица, регион, население, площадь, языки, валюты, соседи.",
            inputsHint = "Не зависит от других нод — RESTCountries /alpha/DE с подмножеством fields.",
            config = b.httpConfig(
                "https://restcountries.com/v3.1/alpha/DE" +
                    "?fields=name,capital,region,subregion,population,languages,currencies," +
                    "area,timezones,borders,maps,car",
            ),
        )
        val holidays = b.node(
            id = "holidays", type = "http",
            x = 380.0, y = 220.0, label = "Next holidays (Nager.Date)",
            purpose = "Тянет ближайшие гос-праздники Германии — полезно для планирования встреч.",
            inputsHint = "Не зависит от других нод — Nager.Date /NextPublicHolidays/DE.",
            config = b.httpConfig("https://date.nager.at/api/v3/NextPublicHolidays/DE"),
        )
        val summary = b.node(
            id = "summary", type = "http",
            x = 380.0, y = 360.0, label = "Wikipedia summary",
            purpose = "Тянет короткую текстовую справку из Wikipedia REST — для вставки в CRM/Notion.",
            inputsHint = "Не зависит от других нод — Wikipedia REST /page/summary/Germany.",
            config = b.httpConfig("https://en.wikipedia.org/api/rest_v1/page/summary/Germany"),
        )
        val dossier = b.node(
            id = "dossier", type = "javascript",
            x = 720.0, y = 240.0, label = "Compile dossier → CRM-ready brief",
            purpose = "Сводит факты, праздники и саммари в один PM-документ для прикрепления к CRM-сделке.",
            inputsHint = "Принимает:\n" +
                "• inputs.country.body[0] — { name, capital, region, subregion, population, area, " +
                "languages, currencies, timezones, borders, maps, car }\n" +
                "• inputs.holidays.body — массив { date, name, localName, types[] }\n" +
                "• inputs.summary.body — { extract, content_urls.desktop.page }",
            config = b.jsConfig(DOSSIER_JS),
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
                const wiki = (input.inputs.summary || {}).body || {};

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

                const countryName = (country.name && country.name.common) || 'Unknown';
                const capital = country.capital ? country.capital[0] : '—';
                const populationM = country.population ? (country.population / 1e6).toFixed(1) : '?';

                const headline = '🌍 ' + countryName + ' (' + (country.region || '?') + ') — pop. '
                    + populationM + 'M, capital ' + capital;

                const summaryText = 'Profile of ' + countryName + ': '
                    + 'capital ' + capital + ', region ' + (country.region || '?')
                    + (country.subregion ? ' / ' + country.subregion : '') + '. '
                    + 'Languages: ' + (languages.join(', ') || '?') + '. '
                    + 'Currencies: ' + (currencies.map(function (c) { return c.code; }).join(', ') || '?') + '. '
                    + 'Area: ' + (country.area ? country.area.toLocaleString('en-US') + ' km²' : '?')
                    + '. Borders: ' + ((country.borders || []).join(', ') || 'none') + '.';

                const keyInsights = [
                    'Population: ' + (country.population ? country.population.toLocaleString('en-US') : '?'),
                    'Languages: ' + (languages.join(', ') || '—'),
                    'Currencies: ' + (currencies.map(function (c) { return c.code + ' (' + c.name + ')'; }).join(', ') || '—'),
                    'Time zones: ' + ((country.timezones || []).join(', ') || '—'),
                    'Driving side: ' + (country.car ? country.car.side : '—'),
                    'Bordering: ' + ((country.borders || []).join(', ') || 'island / none'),
                ];

                const actionItems = [];
                if (next5.length > 0) {
                    actionItems.push('Avoid scheduling meetings on next holidays: '
                        + next5.map(function (h) { return h.date + ' (' + h.name + ')'; }).join('; '));
                }
                actionItems.push('Open mapping for context: ' + ((country.maps || {}).googleMaps || 'n/a'));
                if (wiki.content_urls && wiki.content_urls.desktop) {
                    actionItems.push('Reference page: ' + wiki.content_urls.desktop.page);
                }

                const reportLines = [
                    '## ' + countryName + ' — Sales Dossier',
                    '',
                    headline,
                    '',
                    '**Profile.** ' + summaryText,
                    '',
                    '**Wikipedia.** ' + (wiki.extract || '—'),
                    '',
                    '### Next 5 public holidays',
                ];
                if (next5.length === 0) {
                    reportLines.push('- None in feed');
                } else {
                    next5.forEach(function (h) {
                        reportLines.push('- ' + h.date + ' — ' + h.name + (h.localName && h.localName !== h.name ? ' (' + h.localName + ')' : ''));
                    });
                }
                reportLines.push('');
                reportLines.push('### Action items');
                actionItems.forEach(function (a) { reportLines.push('- ' + a); });

                return {
                    headline: headline,
                    summary: summaryText,
                    keyInsights: keyInsights,
                    actionItems: actionItems,
                    report: reportLines.join('\n'),
                    details: {
                        countryCode: country.cca2 || 'DE',
                        name: countryName,
                        officialName: country.name && country.name.official,
                        capital: capital,
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
                        wikipediaUrl: wiki.content_urls && wiki.content_urls.desktop
                            ? wiki.content_urls.desktop.page : null,
                        wikipediaExtract: wiki.extract || null,
                        nextHolidays: next5,
                    },
                };
            }
        """.trimIndent()
    }
}
