package ru.startem.aelevena.api

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.CreateSnapshotRequest
import ru.startem.aelevena.api.dto.UpdateSnapshotRequest
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.api.dto.WorkflowSnapshot
import ru.startem.aelevena.workflow.WorkflowService
import java.util.UUID

@RestController
@RequestMapping("/workflows/{workflowId}/snapshots")
@Tag(name = "Snapshots", description = "Именованные снапшоты workflow уровня документа")
class WorkflowSnapshotsController(
    private val workflowService: WorkflowService,
) {
    @Operation(
        summary = "Создать снапшот workflow",
        description = "Создаёт именованный снапшот текущего состояния workflow по его идентификатору. " +
            "Принимает имя и необязательное описание. Возвращает созданный снапшот со статусом 201 Created. " +
            "Если workflow не найден, возвращается 404; при некорректном теле запроса (невалидное имя) — 400.",
    )
    @PostMapping
    fun create(
        @PathVariable workflowId: UUID,
        @Valid @RequestBody body: CreateSnapshotRequest,
    ): ResponseEntity<WorkflowSnapshot> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(workflowService.createSnapshot(workflowId, body.name, body.description))

    @Operation(
        summary = "Список снапшотов workflow",
        description = "Возвращает список всех именованных снапшотов для указанного workflow. " +
            "Если снапшотов нет, возвращается пустой список. Если workflow не найден, возвращается 404.",
    )
    @GetMapping
    fun list(@PathVariable workflowId: UUID): List<WorkflowSnapshot> =
        workflowService.listSnapshots(workflowId)

    @Operation(
        summary = "Обновить снапшот workflow",
        description = "Обновляет имя и описание ранее созданного снапшота в рамках указанного workflow. " +
            "Возвращает обновлённый снапшот. Если workflow или снапшот не найдены — 404; при пустом имени — 400.",
    )
    @PatchMapping("/{snapshotId}")
    fun update(
        @PathVariable workflowId: UUID,
        @PathVariable snapshotId: Long,
        @Valid @RequestBody body: UpdateSnapshotRequest,
    ): WorkflowSnapshot =
        workflowService.updateSnapshot(workflowId, snapshotId, body.name, body.description)

    @Operation(
        summary = "Удалить снапшот workflow",
        description = "Удаляет снапшот по его идентификатору в рамках указанного workflow. " +
            "При успешном удалении возвращается 204 No Content без тела. " +
            "Если workflow или снапшот не найдены, возвращается 404.",
    )
    @DeleteMapping("/{snapshotId}")
    fun delete(
        @PathVariable workflowId: UUID,
        @PathVariable snapshotId: Long,
    ): ResponseEntity<Void> {
        workflowService.deleteSnapshot(workflowId, snapshotId)
        return ResponseEntity.noContent().build()
    }

    @Operation(
        summary = "Восстановить workflow из снапшота",
        description = "Восстанавливает состояние workflow из ранее сохранённого снапшота по его идентификатору. " +
            "Возвращает граф workflow, восстановленный из снапшота. " +
            "Если workflow или снапшот не найдены, возвращается 404.",
    )
    @PostMapping("/{snapshotId}/restore")
    fun restore(
        @PathVariable workflowId: UUID,
        @PathVariable snapshotId: Long,
    ): WorkflowGraph = workflowService.restoreSnapshot(workflowId, snapshotId)
}
