package ru.startem.aelevena.api

import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.workflow.WorkflowService

@RestController
@RequestMapping("/workflow-versions")
@Tag(name = "Versions", description = "Редактирование графа рабочей версии workflow")
class WorkflowVersionsController(
    private val workflowService: WorkflowService,
) {
    @PutMapping("/{versionId}/graph")
    fun putGraph(
        @PathVariable versionId: Long,
        @RequestBody @Valid body: WorkflowGraph,
    ): WorkflowGraph = workflowService.updateGraph(versionId, body)
}

