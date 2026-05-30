package ru.startem.aelevena.api

import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.CreateSnapshotRequest
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
    @PostMapping
    fun create(
        @PathVariable workflowId: UUID,
        @Valid @RequestBody body: CreateSnapshotRequest,
    ): ResponseEntity<WorkflowSnapshot> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(workflowService.createSnapshot(workflowId, body.name, body.description))

    @GetMapping
    fun list(@PathVariable workflowId: UUID): List<WorkflowSnapshot> =
        workflowService.listSnapshots(workflowId)

    @DeleteMapping("/{snapshotId}")
    fun delete(
        @PathVariable workflowId: UUID,
        @PathVariable snapshotId: Long,
    ): ResponseEntity<Void> {
        workflowService.deleteSnapshot(workflowId, snapshotId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{snapshotId}/restore")
    fun restore(
        @PathVariable workflowId: UUID,
        @PathVariable snapshotId: Long,
    ): WorkflowGraph = workflowService.restoreSnapshot(workflowId, snapshotId)
}
