package ru.startem.aelevena.api

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.Workflow
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowMeta
import ru.startem.aelevena.api.dto.WorkflowMetaUpdate
import ru.startem.aelevena.api.dto.WorkflowVersion
import ru.startem.aelevena.workflow.WorkflowService
import java.util.UUID

@RestController
@RequestMapping("/workflows")
class WorkflowsController(
    private val workflowService: WorkflowService,
) {
    @PostMapping
    fun create(@Valid @RequestBody body: WorkflowCreateRequest): ResponseEntity<Workflow> =
        ResponseEntity.status(HttpStatus.CREATED).body(workflowService.createWorkflow(body))

    @GetMapping
    fun list(): List<WorkflowMeta> = workflowService.listWorkflows()

    @GetMapping("/{workflowId}")
    fun get(@PathVariable workflowId: UUID): Workflow = workflowService.getWorkflow(workflowId)

    @PutMapping("/{workflowId}")
    fun updateMeta(
        @PathVariable workflowId: UUID,
        @RequestBody body: WorkflowMetaUpdate,
    ): WorkflowMeta = workflowService.updateWorkflowMeta(workflowId, body)

    @DeleteMapping("/{workflowId}")
    fun delete(@PathVariable workflowId: UUID): ResponseEntity<Void> {
        workflowService.deleteWorkflow(workflowId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{workflowId}/versions")
    fun createVersion(@PathVariable workflowId: UUID): ResponseEntity<WorkflowVersion> =
        ResponseEntity.status(HttpStatus.CREATED).body(workflowService.createVersion(workflowId))

    @GetMapping("/{workflowId}/versions")
    fun listVersions(@PathVariable workflowId: UUID): List<WorkflowVersion> =
        workflowService.listVersions(workflowId)
}

