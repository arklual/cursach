package ru.startem.aelevena.seed

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import ru.startem.aelevena.seed.plans.CountryDossierPlan
import ru.startem.aelevena.seed.plans.CryptoDriftPlan
import ru.startem.aelevena.seed.plans.EarthquakeWatchPlan
import ru.startem.aelevena.seed.plans.FxPulsePlan
import ru.startem.aelevena.seed.plans.HolidayCalendarPlan
import ru.startem.aelevena.seed.plans.WeatherRiskPlan

/**
 * Каждый DemoWorkflowPlan имеет фиксированный набор нод/edges. Тест проверяет,
 * что buildGraph не падает и возвращает связный граф с непустым description/name.
 * Заодно даёт coverage всему классу PlanBuilders, через который собираются ноды.
 */
class DemoWorkflowPlanTest {

    private val mapper = ObjectMapper()

    @Test
    fun `HolidayCalendarPlan builds graph with manual + interval triggers`() {
        val plan = HolidayCalendarPlan(mapper)
        assertTrue(plan.name.isNotBlank())
        assertTrue(plan.description.isNotBlank())

        val graph = plan.buildGraph()
        assertNotNull(graph.nodes.firstOrNull { it.type == "trigger.manual" })
        assertNotNull(graph.nodes.firstOrNull { it.type == "trigger.interval" })
        assertTrue(graph.nodes.size >= 6)
        assertTrue(graph.connections.isNotEmpty())
        graph.connections.forEach { c ->
            assertTrue(graph.nodes.any { it.id == c.source }, "edge source ${c.source} unknown")
            assertTrue(graph.nodes.any { it.id == c.target }, "edge target ${c.target} unknown")
        }
    }

    @Test
    fun `EarthquakeWatchPlan builds graph`() {
        val plan = EarthquakeWatchPlan(mapper)
        assertTrue(plan.name.isNotBlank())
        val graph = plan.buildGraph()
        assertTrue(graph.nodes.size >= 3)
        assertTrue(graph.connections.isNotEmpty())
    }

    @Test
    fun `WeatherRiskPlan builds graph`() {
        val plan = WeatherRiskPlan(mapper)
        val graph = plan.buildGraph()
        assertTrue(graph.nodes.isNotEmpty())
        assertTrue(graph.connections.isNotEmpty())
    }

    @Test
    fun `CountryDossierPlan builds graph`() {
        val plan = CountryDossierPlan(mapper)
        val graph = plan.buildGraph()
        assertTrue(graph.nodes.isNotEmpty())
    }

    @Test
    fun `FxPulsePlan builds graph`() {
        val plan = FxPulsePlan(mapper)
        val graph = plan.buildGraph()
        assertTrue(graph.nodes.isNotEmpty())
    }

    @Test
    fun `CryptoDriftPlan builds graph`() {
        val plan = CryptoDriftPlan(mapper)
        val graph = plan.buildGraph()
        assertTrue(graph.nodes.isNotEmpty())
    }

    @Test
    fun `every plan has trigger node and at least one http or code node`() {
        val plans: List<DemoWorkflowPlan> = listOf(
            HolidayCalendarPlan(mapper),
            EarthquakeWatchPlan(mapper),
            WeatherRiskPlan(mapper),
            CountryDossierPlan(mapper),
            FxPulsePlan(mapper),
            CryptoDriftPlan(mapper),
        )
        plans.forEach { plan ->
            val graph = plan.buildGraph()
            val hasTrigger = graph.nodes.any { it.type?.startsWith("trigger.") == true }
            assertTrue(hasTrigger, "${plan.name}: must have trigger node")
            val hasWorker = graph.nodes.any { it.type == "http" || it.type == "javascript" || it.type == "python" }
            assertTrue(hasWorker, "${plan.name}: must have http/javascript/python node")
        }
    }

    @Test
    fun `plan node configs include __purpose annotation`() {
        val plan = HolidayCalendarPlan(mapper)
        val graph = plan.buildGraph()
        // PlanBuilders.node() injects __purpose for every node — must be visible after roundtrip.
        graph.nodes.forEach { n ->
            val purpose = n.data?.config?.get("__purpose")?.asText()
            assertNotNull(purpose, "node ${n.id} missing __purpose")
            assertTrue(purpose!!.isNotBlank())
        }
    }

    @Test
    fun `connections reference existing nodes for all plans`() {
        val plans = listOf(
            HolidayCalendarPlan(mapper),
            EarthquakeWatchPlan(mapper),
            WeatherRiskPlan(mapper),
            CountryDossierPlan(mapper),
            FxPulsePlan(mapper),
            CryptoDriftPlan(mapper),
        )
        plans.forEach { plan ->
            val g = plan.buildGraph()
            val ids = g.nodes.map { it.id }.toSet()
            g.connections.forEach { c ->
                assertTrue(c.source in ids, "${plan.name}: bad source ${c.source}")
                assertTrue(c.target in ids, "${plan.name}: bad target ${c.target}")
            }
        }
    }

    @Test
    fun `PlanBuilders dataflowConfig builds nested config`() {
        val b = PlanBuilders(mapper)
        val cfg = b.dataflowConfig(
            from = "src",
            field = "amount",
            op = "gt",
            value = 100,
            select = listOf("id", "name"),
            rename = mapOf("newName" to "oldName"),
            wrap = "result",
        )
        assertEquals("src", cfg.get("from").asText())
        assertEquals("amount", cfg.get("field").asText())
        assertEquals("gt", cfg.get("op").asText())
        assertEquals(100, cfg.get("value").asInt())
        assertTrue(cfg.get("select").isArray)
        assertEquals(2, cfg.get("select").size())
        assertEquals("oldName", cfg.get("rename").get("newName").asText())
        assertEquals("result", cfg.get("wrap").asText())
    }

    @Test
    fun `PlanBuilders dataflowConfig handles different value types`() {
        val b = PlanBuilders(mapper)

        val intVal = b.dataflowConfig(value = 5)
        assertEquals(5, intVal.get("value").asInt())

        val longVal = b.dataflowConfig(value = 5L)
        assertEquals(5L, longVal.get("value").asLong())

        val doubleVal = b.dataflowConfig(value = 1.5)
        assertEquals(1.5, doubleVal.get("value").asDouble())

        val boolVal = b.dataflowConfig(value = true)
        assertEquals(true, boolVal.get("value").asBoolean())

        val strVal = b.dataflowConfig(value = "x")
        assertEquals("x", strVal.get("value").asText())
    }

    @Test
    fun `PlanBuilders edge and graph helpers produce expected shape`() {
        val b = PlanBuilders(mapper)
        val n = b.node(id = "a", type = "http", x = 0.0, y = 0.0, label = "L", purpose = "P")
        val e = b.edge("a", "b")
        val g = b.graph(listOf(n), listOf(e))
        assertEquals(1, g.nodes.size)
        assertEquals(1, g.connections.size)
        assertEquals("c-a-b", e.id)
        assertEquals("a", e.source)
        assertEquals("b", e.target)
    }

    @Test
    fun `PlanBuilders httpConfig defaults method GET and timeout 30s`() {
        val b = PlanBuilders(mapper)
        val cfg = b.httpConfig("https://example.com")
        assertEquals("https://example.com", cfg.get("url").asText())
        assertEquals("GET", cfg.get("method").asText())
        assertEquals(30_000L, cfg.get("timeoutMs").asLong())
    }

    @Test
    fun `PlanBuilders code configs include timeout`() {
        val b = PlanBuilders(mapper)
        val js = b.jsConfig("return input;", timeoutSeconds = 5L)
        assertEquals("return input;", js.get("code").asText())
        assertEquals(5L, js.get("timeoutSeconds").asLong())

        val py = b.pyConfig("return input", timeoutSeconds = 7L)
        assertEquals("return input", py.get("code").asText())
        assertEquals(7L, py.get("timeoutSeconds").asLong())
    }

    @Test
    fun `PlanBuilders cron and interval configs include keys validated by TriggerService`() {
        val b = PlanBuilders(mapper)
        val cron = b.cronConfig("0 0 * * * *", description = "hourly")
        assertEquals("0 0 * * * *", cron.get("cron").asText())
        assertEquals("hourly", cron.get("description").asText())

        val interval = b.intervalConfig(everySeconds = 60L, description = "minute")
        assertEquals(60L, interval.get("everySeconds").asLong())
        assertEquals("minute", interval.get("description").asText())
    }

    @Test
    fun `PlanBuilders node preserves caller-supplied config`() {
        val b = PlanBuilders(mapper)
        val cfg = mapper.createObjectNode().put("url", "https://x.test")
        val n = b.node(
            id = "x", type = "http", x = 1.0, y = 2.0,
            label = "X", purpose = "P", inputsHint = "I", config = cfg,
        )
        val finalCfg = n.data!!.config!!
        assertEquals("https://x.test", finalCfg.get("url").asText())
        assertEquals("P", finalCfg.get("__purpose").asText())
        assertEquals("I", finalCfg.get("__inputsHint").asText())
    }
}
