package ru.startem.aelevena.seed

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.workflow.WorkflowService
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository

/**
 * Поднимает набор демонстрационных workflow'ов на старте приложения.
 *
 * Зачем не Liquibase: graph_skeleton хранит ссылки на конфиги-блобы (configHash → S3).
 * SQL-миграция способна записать строки в `workflows`/`workflow_revision`/`workflow_version`,
 * но не способна положить соответствующие JSON-объекты в S3 — без них materializeGraph()
 * упадёт на getJsonTree(). Поэтому посев идёт через WorkflowService.{createWorkflow,updateGraph},
 * который проходит через BlobService и кладёт конфиги канонично в S3.
 *
 * Идемпотентность: уже существующее имя → пропуск. Имена демо-планов трактуются как стабильный ID.
 *
 * Управление: app.seed.demo-workflows-enabled (default true). В тестах/проде можно отключить.
 */
@Component
@ConditionalOnProperty(
    prefix = "app.seed",
    name = ["demo-workflows-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class DemoWorkflowSeeder(
    private val workflowService: WorkflowService,
    private val workflowsRepository: WorkflowsRepository,
    private val plans: List<DemoWorkflowPlan>,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @EventListener(ApplicationReadyEvent::class)
    fun seed() {
        if (plans.isEmpty()) {
            return
        }
        val existingNames = workflowsRepository.list().map { it.name }.toSet()
        var created = 0
        plans.forEach { plan ->
            if (plan.name in existingNames) {
                log.debug("Skipping demo workflow '{}': already exists", plan.name)
                return@forEach
            }
            try {
                val workflow = workflowService.createWorkflow(
                    WorkflowCreateRequest(name = plan.name, description = plan.description),
                    isDemo = true,
                )
                val versionId = workflow.graph.versionId.toLong()
                workflowService.updateGraph(versionId, plan.buildGraph())
                created++
                log.info("Seeded demo workflow '{}' (id={})", plan.name, workflow.meta.id)
            } catch (e: Exception) {
                log.warn("Failed to seed demo workflow '{}': {}", plan.name, e.message, e)
            }
        }
        if (created > 0) {
            log.info("Demo workflow seeding finished: {} workflow(s) created out of {}", created, plans.size)
        }
    }
}
