package ru.startem.aelevena.seed

import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.mockito.Mockito.anyLong
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import ru.startem.aelevena.api.dto.Workflow
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.api.dto.WorkflowMeta
import ru.startem.aelevena.workflow.WorkflowService
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.time.OffsetDateTime
import java.util.UUID

/**
 * Unit-level coverage for DemoWorkflowSeeder branches that don't fire on a clean install
 * integration test: empty-plan early return, repair of pre-existing empty workflows,
 * markAsDemo upgrade for legacy rows, and silent-failure on plan exceptions.
 */
class DemoWorkflowSeederUnitTest {

    private val workflowService: WorkflowService = mock(WorkflowService::class.java)
    private val workflowsRepository: WorkflowsRepository = mock(WorkflowsRepository::class.java)

    private fun makePlan(name: String, description: String = "d", graph: WorkflowGraph = emptyGraph()): DemoWorkflowPlan =
        object : DemoWorkflowPlan {
            override val name: String = name
            override val description: String = description
            override fun buildGraph(): WorkflowGraph = graph
        }

    private fun emptyGraph(): WorkflowGraph =
        WorkflowGraph(versionId = "1", nodes = emptyList(), connections = emptyList())

    private fun row(
        id: UUID = UUID.randomUUID(),
        name: String,
        isDemo: Boolean = false,
        nodesCount: Int = 0,
        currentVersionId: Long? = 1L,
    ): WorkflowsRepository.WorkflowRow = WorkflowsRepository.WorkflowRow(
        id = id,
        name = name,
        description = null,
        isDemo = isDemo,
        nodesCount = nodesCount,
        currentVersionId = currentVersionId,
        createdAt = OffsetDateTime.now(),
        updatedAt = OffsetDateTime.now(),
    )

    private fun newWorkflow(versionId: Long): Workflow = Workflow(
        meta = WorkflowMeta(
            id = UUID.randomUUID().toString(), name = "x",
            createdAt = "t", updatedAt = "t",
        ),
        graph = WorkflowGraph(versionId = versionId.toString(), nodes = emptyList(), connections = emptyList()),
    )

    @Test
    fun `seed with no plans is no-op`() {
        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, emptyList())
        seeder.seed()
        verify(workflowsRepository, never()).list()
    }

    @Test
    fun `seed creates workflow when plan name is not present`() {
        val plan = makePlan("Demo A")
        `when`(workflowsRepository.list()).thenReturn(emptyList())
        `when`(
            workflowService.createWorkflow(
                any(WorkflowCreateRequest::class.java) ?: WorkflowCreateRequest("x"),
                eqBool(true),
            ),
        ).thenReturn(newWorkflow(42L))

        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, listOf(plan))
        seeder.seed()

        verify(workflowService).createWorkflow(
            any(WorkflowCreateRequest::class.java) ?: WorkflowCreateRequest("x"),
            eqBool(true),
        )
        verify(workflowService).updateGraph(
            anyLong(),
            any(WorkflowGraph::class.java) ?: emptyGraph(),
        )
    }

    @Test
    fun `seed marks legacy non-demo row as demo and skips creation when populated`() {
        val plan = makePlan("Legacy")
        val existing = row(name = "Legacy", isDemo = false, nodesCount = 3)
        `when`(workflowsRepository.list()).thenReturn(listOf(existing))
        `when`(workflowsRepository.markAsDemo(existing.id)).thenReturn(true)

        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, listOf(plan))
        seeder.seed()

        verify(workflowsRepository).markAsDemo(existing.id)
    }

    @Test
    fun `seed repairs existing empty workflow by calling updateGraph`() {
        val plan = makePlan("To Repair")
        val existing = row(name = "To Repair", isDemo = true, nodesCount = 0, currentVersionId = 7L)
        `when`(workflowsRepository.list()).thenReturn(listOf(existing))

        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, listOf(plan))
        seeder.seed()

        verify(workflowService).updateGraph(
            org.mockito.ArgumentMatchers.eq(7L),
            any(WorkflowGraph::class.java) ?: emptyGraph(),
        )
    }

    @Test
    fun `seed skips populated existing workflows quietly`() {
        val plan = makePlan("Already")
        val existing = row(name = "Already", isDemo = true, nodesCount = 5)
        `when`(workflowsRepository.list()).thenReturn(listOf(existing))

        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, listOf(plan))
        seeder.seed()

        verify(workflowsRepository, never()).markAsDemo(existing.id)
        verify(workflowService, never()).updateGraph(
            anyLong(),
            any(WorkflowGraph::class.java) ?: emptyGraph(),
        )
    }

    @Test
    fun `seed swallows per-plan exceptions and continues with the rest`() {
        val planA = makePlan("Plan A")
        val planB = makePlan("Plan B")
        `when`(workflowsRepository.list()).thenReturn(emptyList())
        `when`(
            workflowService.createWorkflow(
                any(WorkflowCreateRequest::class.java) ?: WorkflowCreateRequest("x"),
                eqBool(true),
            ),
        )
            .thenThrow(RuntimeException("boom on A"))
            .thenReturn(newWorkflow(9L))

        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, listOf(planA, planB))
        seeder.seed()

        verify(workflowService, times(2)).createWorkflow(
            any(WorkflowCreateRequest::class.java) ?: WorkflowCreateRequest("x"),
            eqBool(true),
        )
        verify(workflowService).updateGraph(
            org.mockito.ArgumentMatchers.eq(9L),
            any(WorkflowGraph::class.java) ?: emptyGraph(),
        )
    }

    @Test
    fun `seed swallows missing-currentVersion error on empty existing row`() {
        val plan = makePlan("Bad")
        val existing = row(name = "Bad", isDemo = true, nodesCount = 0, currentVersionId = null)
        `when`(workflowsRepository.list()).thenReturn(listOf(existing))

        val seeder = DemoWorkflowSeeder(workflowService, workflowsRepository, listOf(plan))
        // The inner `error(...)` call gets caught by the per-plan try/catch — seed() does not throw.
        seeder.seed()
    }

    // Helpers — Mockito argument matchers return null in Kotlin, which crashes on non-null types.
    // Fallback values keep the type system happy while the matcher does the real work.
    private fun <T> any(clazz: Class<T>): T? {
        return org.mockito.ArgumentMatchers.any(clazz)
    }

    private fun eqBool(value: Boolean): Boolean = org.mockito.ArgumentMatchers.eq(value)
}
