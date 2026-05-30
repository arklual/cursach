package ru.startem.aelevena.seed

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.workflow.WorkflowService
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository

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
        val existingByName: Map<String, WorkflowsRepository.WorkflowRow> =
            workflowsRepository.list().associateBy { it.name }
        var created = 0
        var repaired = 0
        var marked = 0
        plans.forEach { plan ->
            val existing = existingByName[plan.name]
            try {
                if (existing != null && !existing.isDemo) {
                    if (workflowsRepository.markAsDemo(existing.id)) {
                        marked++
                    }
                }
                if (existing == null) {
                    val workflow = workflowService.createWorkflow(
                        WorkflowCreateRequest(name = plan.name, description = plan.description),
                        isDemo = true,
                    )
                    val versionId = workflow.graph.versionId.toLong()
                    workflowService.updateGraph(versionId, plan.buildGraph())
                    created++
                    log.info("Seeded demo workflow '{}' (id={})", plan.name, workflow.meta.id)
                } else if (existing.nodesCount == 0) {
                    val versionId = existing.currentVersionId
                        ?: error("Demo workflow '${plan.name}' has no current version — repair impossible")
                    workflowService.updateGraph(versionId, plan.buildGraph())
                    repaired++
                    log.info("Repaired empty demo workflow '{}' (id={})", plan.name, existing.id)
                } else {
                    log.debug("Skipping demo workflow '{}': already populated", plan.name)
                }
            } catch (e: Exception) {
                log.warn("Failed to seed demo workflow '{}': {}", plan.name, e.message, e)
            }
        }
        if (created > 0 || repaired > 0 || marked > 0) {
            log.info(
                "Demo workflow seeding finished: created={}, repaired={}, marked={}, total plans={}",
                created, repaired, marked, plans.size,
            )
        }
    }
}
