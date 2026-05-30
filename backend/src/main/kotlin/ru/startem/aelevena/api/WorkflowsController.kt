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
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import ru.startem.aelevena.api.dto.Workflow
import ru.startem.aelevena.api.dto.WorkflowCreateRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.api.dto.WorkflowMeta
import ru.startem.aelevena.api.dto.WorkflowMetaUpdate
import ru.startem.aelevena.api.dto.WorkflowVersion
import ru.startem.aelevena.api.dto.WorkflowVersionCreateRequest
import ru.startem.aelevena.workflow.WorkflowService
import java.util.UUID

@RestController
@RequestMapping("/workflows")
@Tag(name = "Workflows", description = "Создание, чтение, обновление workflow и управление их версиями")
class WorkflowsController(
    private val workflowService: WorkflowService,
) {
    @Operation(
        summary = "Создать workflow",
        description = "Создаёт новый workflow по переданным данным. Возвращает созданный workflow и код 201 Created. При невалидном теле запроса возвращает 400.",
    )
    @PostMapping
    fun create(@Valid @RequestBody body: WorkflowCreateRequest): ResponseEntity<Workflow> =
        ResponseEntity.status(HttpStatus.CREATED).body(workflowService.createWorkflow(body))

    @Operation(
        summary = "Список workflow",
        description = "Возвращает список метаданных всех доступных workflow. При пустом наборе возвращает пустой список и код 200.",
    )
    @GetMapping
    fun list(): List<WorkflowMeta> = workflowService.listWorkflows()

    @Operation(
        summary = "Получить workflow",
        description = "Возвращает workflow по его идентификатору. Если workflow не найден, возвращает 404.",
    )
    @GetMapping("/{workflowId}")
    fun get(@PathVariable workflowId: UUID): Workflow = workflowService.getWorkflow(workflowId)

    @Operation(
        summary = "Обновить метаданные workflow",
        description = "Обновляет метаданные workflow (например, имя и описание) по идентификатору. Возвращает обновлённые метаданные. Если workflow не найден, возвращает 404.",
    )
    @PutMapping("/{workflowId}")
    fun updateMeta(
        @PathVariable workflowId: UUID,
        @RequestBody body: WorkflowMetaUpdate,
    ): WorkflowMeta = workflowService.updateWorkflowMeta(workflowId, body)

    @Operation(
        summary = "Удалить workflow",
        description = "Удаляет workflow по идентификатору. При успехе возвращает 204 No Content без тела. Если workflow не найден, возвращает 404.",
    )
    @DeleteMapping("/{workflowId}")
    fun delete(@PathVariable workflowId: UUID): ResponseEntity<Void> {
        workflowService.deleteWorkflow(workflowId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{workflowId}/versions")
    @Operation(summary = "Создать именованную версию", description = "Фиксирует текущую ревизию как именованную версию (тег опционален)")
    fun createVersion(
        @PathVariable workflowId: UUID,
        @RequestBody(required = false) body: WorkflowVersionCreateRequest?,
    ): ResponseEntity<WorkflowVersion> =
        ResponseEntity.status(HttpStatus.CREATED).body(workflowService.createVersion(workflowId, body?.versionTag))

    @GetMapping("/{workflowId}/versions")
    @Operation(summary = "Список версий workflow")
    fun listVersions(@PathVariable workflowId: UUID): List<WorkflowVersion> =
        workflowService.listVersions(workflowId)

    @PostMapping("/{workflowId}/versions/{versionId}/restore")
    @Operation(summary = "Откат к версии", description = "Создаёт новую (append-only) ревизию с графом указанной версии")
    fun restoreVersion(
        @PathVariable workflowId: UUID,
        @PathVariable versionId: Long,
    ): WorkflowGraph = workflowService.restoreVersion(workflowId, versionId)
}

