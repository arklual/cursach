package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Service
import ru.startem.aelevena.api.dto.ExecutionData
import ru.startem.aelevena.api.dto.ExecutionError
import ru.startem.aelevena.api.dto.ExecutionStatus
import ru.startem.aelevena.api.dto.NodeExecutionStatus
import ru.startem.aelevena.workflow.WorkflowService
import java.time.Instant
import java.util.UUID

/**
 * Сервис исполнения workflow
 * Управляет последовательным выполнением нод и сбором данных
 */
@Service
class ExecutionService(
    private val workflowService: WorkflowService,
    private val executorRegistry: NodeExecutorRegistry,
) {
    private val executions = mutableMapOf<String, MutableExecution>()

    data class MutableExecution(
        val id: String,
        val workflowId: UUID,
        var status: String = "running",
        val startedAt: String = Instant.now().toString(),
        var stoppedAt: String? = null,
        var duration: Long? = null,
        val nodes: MutableList<MutableNodeExecution> = mutableListOf(),
    )

    data class MutableNodeExecution(
        val nodeId: String,
        val nodeName: String,
        val nodeType: String,
        var status: String = "pending",
        var startTime: String? = null,
        var endTime: String? = null,
        var duration: Long? = null,
        var inputData: List<ExecutionData>? = null,
        var outputData: List<ExecutionData>? = null,
        var error: ExecutionError? = null,
        var itemsCount: Int? = null,
    )

    /**
     * Запустить исполнение workflow
     */
    fun executeWorkflow(
        workflowId: UUID,
        fromNodeId: String? = null,
        inputData: Map<String, JsonNode>? = null
    ): ExecutionStatus {
        val executionId = "exec-${UUID.randomUUID()}"
        val workflow = workflowService.getWorkflow(workflowId)
        
        val execution = MutableExecution(
            id = executionId,
            workflowId = workflowId
        )
        
        executions[executionId] = execution
        
        // Инициализируем ноды
        workflow.graph.nodes.forEach { node ->
            execution.nodes.add(
                MutableNodeExecution(
                    nodeId = node.id,
                    nodeName = node.data?.label ?: node.id,
                    nodeType = node.type,
                    status = "pending"
                )
            )
        }
        
        // Последовательное исполнение нод
        try {
            executeNodesSequential(execution, workflow.graph.nodes, fromNodeId, inputData)
            execution.status = "success"
        } catch (e: Exception) {
            execution.status = "error"
            val start = Instant.parse(execution.startedAt)
            execution.stoppedAt = Instant.now().toString()
            execution.duration = java.time.Duration.between(start, Instant.now()).toMillis()
        }
        
        val start = Instant.parse(execution.startedAt)
        execution.stoppedAt = Instant.now().toString()
        execution.duration = java.time.Duration.between(start, Instant.now()).toMillis()
        
        return ExecutionStatus(
            status = execution.status,
            workflowId = workflowId.toString(),
            executionId = executionId,
            startedAt = execution.startedAt,
            stoppedAt = execution.stoppedAt,
            duration = execution.duration,
            nodes = execution.nodes.map { it.toImmutable() }
        )
    }

    /**
     * Запустить исполнение с конкретной ноды
     */
    fun executeFromNode(
        executionId: String,
        nodeId: String,
        inputData: Map<String, JsonNode>? = null
    ): ExecutionStatus {
        val execution = executions[executionId]
            ?: throw IllegalArgumentException("Execution $executionId not found")
        
        val workflow = workflowService.getWorkflow(execution.workflowId)
        val node = workflow.graph.nodes.find { it.id == nodeId }
            ?: throw IllegalArgumentException("Node $nodeId not found")
        
        // Обновляем статус ноды
        val nodeStatus = execution.nodes.find { it.nodeId == nodeId }
            ?: throw IllegalArgumentException("Node $nodeId not in execution")
        
        nodeStatus.status = "running"
        nodeStatus.startTime = Instant.now().toString()
        
        try {
            val executor = executorRegistry.getExecutor(node.type)
            val input: ObjectNode
            if (inputData != null) {
                val objNode: ObjectNode = executorRegistry.getObjectMapper().createObjectNode()
                for ((key, value) in inputData) {
                    objNode.set<JsonNode>(key, value)
                }
                input = objNode
            } else {
                input = executorRegistry.getObjectMapper().createObjectNode()
            }

            val output = executor.execute(nodeId, node.data?.config, input)
            
            nodeStatus.status = "success"
            nodeStatus.endTime = Instant.now().toString()
            val start = Instant.parse(nodeStatus.startTime!!)
            nodeStatus.duration = java.time.Duration.between(start, Instant.now()).toMillis()
            nodeStatus.outputData = listOf(ExecutionData(json = output))
            nodeStatus.itemsCount = 1
        } catch (e: Exception) {
            nodeStatus.status = "error"
            nodeStatus.endTime = Instant.now().toString()
            nodeStatus.error = ExecutionError(
                message = e.message ?: "Unknown error",
                details = e.cause?.message,
                stack = e.stackTraceToString()
            )
            execution.status = "error"
        }
        
        val start = Instant.parse(execution.startedAt)
        execution.stoppedAt = Instant.now().toString()
        execution.duration = java.time.Duration.between(start, Instant.now()).toMillis()
        
        return ExecutionStatus(
            status = execution.status,
            workflowId = execution.workflowId.toString(),
            executionId = executionId,
            startedAt = execution.startedAt,
            stoppedAt = execution.stoppedAt,
            duration = execution.duration,
            nodes = execution.nodes.map { it.toImmutable() }
        )
    }

    /**
     * Получить статус исполнения
     */
    fun getExecutionStatus(executionId: String): ExecutionStatus {
        val execution = executions[executionId]
            ?: throw IllegalArgumentException("Execution $executionId not found")
        
        return ExecutionStatus(
            status = execution.status,
            workflowId = execution.workflowId.toString(),
            executionId = executionId,
            startedAt = execution.startedAt,
            stoppedAt = execution.stoppedAt,
            duration = execution.duration,
            nodes = execution.nodes.map { it.toImmutable() }
        )
    }

    /**
     * Остановить исполнение
     */
    fun stopExecution(executionId: String): ExecutionStatus {
        val execution = executions[executionId]
            ?: throw IllegalArgumentException("Execution $executionId not found")
        
        execution.status = "error"
        val start = Instant.parse(execution.startedAt)
        execution.stoppedAt = Instant.now().toString()
        execution.duration = java.time.Duration.between(start, Instant.now()).toMillis()
        
        return ExecutionStatus(
            status = execution.status,
            workflowId = execution.workflowId.toString(),
            executionId = executionId,
            startedAt = execution.startedAt,
            stoppedAt = execution.stoppedAt,
            duration = execution.duration,
            nodes = execution.nodes.map { it.toImmutable() }
        )
    }

    /**
     * Список исполнений workflow
     */
    fun listWorkflowExecutions(workflowId: UUID): List<ExecutionStatus> {
        return executions.values
            .filter { it.workflowId == workflowId }
            .map { execution ->
                ExecutionStatus(
                    status = execution.status,
                    workflowId = execution.workflowId.toString(),
                    executionId = execution.id,
                    startedAt = execution.startedAt,
                    stoppedAt = execution.stoppedAt,
                    duration = execution.duration,
                    nodes = execution.nodes.map { it.toImmutable() }
                )
            }
    }

    // ============================================================================
    // Внутренняя логика исполнения
    // ============================================================================

    private fun executeNodesSequential(
        execution: MutableExecution,
        nodes: List<ru.startem.aelevena.api.dto.Node>,
        fromNodeId: String?,
        inputData: Map<String, JsonNode>?
    ) {
        val mapper = executorRegistry.getObjectMapper()
        var currentInput: ObjectNode
        if (inputData != null) {
            val objNode: ObjectNode = mapper.createObjectNode()
            for ((key, value) in inputData) {
                objNode.set<JsonNode>(key, value)
            }
            currentInput = objNode
        } else {
            currentInput = mapper.createObjectNode()
        }
        
        val startIndex = if (fromNodeId != null) {
            nodes.indexOfFirst { it.id == fromNodeId }
        } else 0
        
        for (i in startIndex until nodes.size) {
            val node = nodes[i]
            val nodeStatus = execution.nodes.find { it.nodeId == node.id }!!
            
            nodeStatus.status = "running"
            nodeStatus.startTime = Instant.now().toString()
            nodeStatus.inputData = listOf(ExecutionData(json = currentInput))
            
            try {
                val executor = executorRegistry.getExecutor(node.type)
                val output = executor.execute(node.id, node.data?.config, currentInput)
                
                nodeStatus.status = "success"
                nodeStatus.endTime = Instant.now().toString()
                val start = Instant.parse(nodeStatus.startTime!!)
                nodeStatus.duration = java.time.Duration.between(start, Instant.now()).toMillis()
                nodeStatus.outputData = listOf(ExecutionData(json = output))
                nodeStatus.itemsCount = 1
                
                // Передаём output следующей ноде
                if (output is ObjectNode) {
                    currentInput = output
                }
            } catch (e: Exception) {
                nodeStatus.status = "error"
                nodeStatus.endTime = Instant.now().toString()
                nodeStatus.error = ExecutionError(
                    message = e.message ?: "Unknown error",
                    details = e.cause?.message,
                    stack = e.stackTraceToString()
                )
                throw e // Прерываем исполнение workflow
            }
        }
    }
}

// Extension function для конвертации
private fun ExecutionService.MutableNodeExecution.toImmutable(): NodeExecutionStatus {
    return NodeExecutionStatus(
        nodeId = this.nodeId,
        nodeName = this.nodeName,
        nodeType = this.nodeType,
        status = this.status,
        startTime = this.startTime,
        endTime = this.endTime,
        duration = this.duration,
        inputData = this.inputData,
        outputData = this.outputData,
        error = this.error,
        itemsCount = this.itemsCount
    )
}
