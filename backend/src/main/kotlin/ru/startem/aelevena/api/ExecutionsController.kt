package ru.startem.aelevena.api

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.ExecuteWorkflowRequest
import ru.startem.aelevena.api.dto.ExecutionStatus
import ru.startem.aelevena.executor.ExecutionService
import java.util.UUID

/**
 * REST контроллер для управления исполнением workflow
 * Аналог n8n execution API
 */
@RestController
@RequestMapping("/executions")
class ExecutionsController(
    private val executionService: ExecutionService,
) {
    /**
     * Запустить исполнение workflow
     */
    @PostMapping
    fun executeWorkflow(@RequestBody request: ExecuteWorkflowRequest): ResponseEntity<ExecutionStatus> {
        val execution = executionService.executeWorkflow(
            workflowId = UUID.fromString(request.workflowId),
            fromNodeId = request.fromNodeId,
            inputData = request.inputData
        )
        return ResponseEntity.ok(execution)
    }

    /**
     * Запустить исполнение с конкретной ноды
     */
    @PostMapping("/{executionId}/from-node/{nodeId}")
    fun executeFromNode(
        @PathVariable executionId: String,
        @PathVariable nodeId: String,
        @RequestBody inputData: Map<String, com.fasterxml.jackson.databind.JsonNode>? = null
    ): ResponseEntity<ExecutionStatus> {
        val execution = executionService.executeFromNode(
            executionId = executionId,
            nodeId = nodeId,
            inputData = inputData
        )
        return ResponseEntity.ok(execution)
    }

    /**
     * Получить статус исполнения
     */
    @GetMapping("/{executionId}")
    fun getExecutionStatus(@PathVariable executionId: String): ResponseEntity<ExecutionStatus> {
        val execution = executionService.getExecutionStatus(executionId)
        return ResponseEntity.ok(execution)
    }

    /**
     * Остановить исполнение
     */
    @PostMapping("/{executionId}/stop")
    fun stopExecution(@PathVariable executionId: String): ResponseEntity<ExecutionStatus> {
        val execution = executionService.stopExecution(executionId)
        return ResponseEntity.ok(execution)
    }

    /**
     * Получить историю исполнений workflow
     */
    @GetMapping("/workflow/{workflowId}")
    fun listWorkflowExecutions(@PathVariable workflowId: String): ResponseEntity<List<ExecutionStatus>> {
        val executions = executionService.listWorkflowExecutions(UUID.fromString(workflowId))
        return ResponseEntity.ok(executions)
    }
}
