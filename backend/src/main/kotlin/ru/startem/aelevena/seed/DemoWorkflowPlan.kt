package ru.startem.aelevena.seed

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import ru.startem.aelevena.api.dto.Connection
import ru.startem.aelevena.api.dto.Node
import ru.startem.aelevena.api.dto.NodeData
import ru.startem.aelevena.api.dto.Position
import ru.startem.aelevena.api.dto.WorkflowGraph

/**
 * Демонстрационный workflow, поднимаемый на старте через DemoWorkflowSeeder.
 *
 * Идемпотентность — на уровне seeder'а: совпадение по [name] трактуется как «уже посеяно».
 * Имя должно быть стабильным между релизами; меняя имя — фактически создаёшь новый шаблон.
 */
interface DemoWorkflowPlan {
    val name: String
    val description: String
    fun buildGraph(): WorkflowGraph
}

/**
 * Утилиты конструирования графа — экономят 80% бойлерплейта в каждом DemoWorkflowPlan.
 * Не лежат в WorkflowService: это специфика именно seeder'а, и тащить в прод-сервис их незачем.
 *
 * `purpose` / `inputsHint` кладутся в config как `__purpose` / `__inputsHint`. Бэкенд-executor'ы
 * читают только специфичные ключи (url/code/...), а frontend-mapper извлекает `__*`-ключи в
 * отдельные поля NodeData и рендерит их в карточке ноды и инспекторе. Это даёт PM'у явное
 * описание «что нода делает и какие данные принимает» без ковыряния в JS-коде.
 */
internal class PlanBuilders(private val mapper: ObjectMapper) {

    /**
     * @param purpose Одно предложение «что эта нода делает» — рендерится в теле карточки ноды.
     * @param inputsHint Развёрнутое описание «какие данные и из каких предыдущих нод принимаем» —
     *                   рендерится в инспекторе. null для нод без входа (триггеры).
     */
    fun node(
        id: String,
        type: String,
        x: Double,
        y: Double,
        label: String,
        purpose: String,
        inputsHint: String? = null,
        config: JsonNode? = null,
    ): Node {
        val finalConfig = (config?.deepCopy() as? com.fasterxml.jackson.databind.node.ObjectNode)
            ?: mapper.createObjectNode()
        finalConfig.put("__purpose", purpose)
        if (inputsHint != null) {
            finalConfig.put("__inputsHint", inputsHint)
        }
        return Node(
            id = id,
            type = type,
            position = Position(x, y),
            data = NodeData(label = label, config = finalConfig),
        )
    }

    fun edge(source: String, target: String): Connection =
        Connection(id = "c-$source-$target", source = source, target = target)

    fun graph(nodes: List<Node>, edges: List<Connection>): WorkflowGraph =
        WorkflowGraph(versionId = "", nodes = nodes, connections = edges)

    fun httpConfig(url: String, method: String = "GET", timeoutMs: Long = 30_000L): JsonNode {
        val cfg = mapper.createObjectNode()
        cfg.put("url", url)
        cfg.put("method", method)
        cfg.put("timeoutMs", timeoutMs)
        return cfg
    }

    fun jsConfig(code: String, timeoutSeconds: Long = 10L): JsonNode {
        val cfg = mapper.createObjectNode()
        cfg.put("code", code)
        cfg.put("timeoutSeconds", timeoutSeconds)
        return cfg
    }

    fun pyConfig(code: String, timeoutSeconds: Long = 10L): JsonNode {
        val cfg = mapper.createObjectNode()
        cfg.put("code", code)
        cfg.put("timeoutSeconds", timeoutSeconds)
        return cfg
    }

    /**
     * Конфиг для dataflow-ноды. `from` опционально указывает имя upstream-ноды, из которой
     * брать массив (если upstream'ов несколько и executor не сможет угадать сам). Остальные
     * параметры (field/op/value/select/rename/wrap) совпадают с контрактом конкретного executor'а.
     */
    fun dataflowConfig(
        from: String? = null,
        field: String? = null,
        op: String? = null,
        value: Any? = null,
        select: List<String>? = null,
        rename: Map<String, String>? = null,
        wrap: String? = null,
    ): JsonNode {
        val cfg = mapper.createObjectNode()
        if (from != null) cfg.put("from", from)
        if (field != null) cfg.put("field", field)
        if (op != null) cfg.put("op", op)
        if (value != null) {
            when (value) {
                is Int -> cfg.put("value", value)
                is Long -> cfg.put("value", value)
                is Double -> cfg.put("value", value)
                is Boolean -> cfg.put("value", value)
                else -> cfg.put("value", value.toString())
            }
        }
        if (select != null) {
            val arr = cfg.putArray("select")
            select.forEach { arr.add(it) }
        }
        if (rename != null) {
            val obj = cfg.putObject("rename")
            rename.forEach { (newName, oldName) -> obj.put(newName, oldName) }
        }
        if (wrap != null) cfg.put("wrap", wrap)
        return cfg
    }

    /**
     * Конфиг cron-триггера. Поле `expression` — стандартная Spring-cron строка.
     * Сам исполняемый узел — passthrough; реальный планировщик подключается через TriggerService,
     * но в seed-планах нам важна именно визуализация типа узла на канве.
     */
    fun cronConfig(expression: String, description: String? = null): JsonNode {
        val cfg = mapper.createObjectNode()
        cfg.put("expression", expression)
        if (description != null) cfg.put("description", description)
        return cfg
    }

    /**
     * Конфиг interval-триггера. `seconds` — период между прогонами.
     */
    fun intervalConfig(seconds: Long, description: String? = null): JsonNode {
        val cfg = mapper.createObjectNode()
        cfg.put("seconds", seconds)
        if (description != null) cfg.put("description", description)
        return cfg
    }
}
