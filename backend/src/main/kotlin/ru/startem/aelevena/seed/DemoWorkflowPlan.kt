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
}
