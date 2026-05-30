package ru.startem.aelevena.triggers

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.Trigger
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

private const val TRIGGER_TYPE_PREFIX = "trigger."

@Service
class TriggerService(
    private val triggers: TriggersRepository,
    private val workflows: WorkflowsRepository,
    private val scheduler: TriggerScheduler,
    private val runEnqueueService: RunEnqueueService,
    private val objectMapper: ObjectMapper,
) {
    private val random = SecureRandom()

    @Transactional(readOnly = true)
    fun list(workflowId: UUID): List<Trigger> {
        if (workflows.findById(workflowId) == null) {
            throw NotFoundException("Workflow not found")
        }
        return triggers.listByWorkflow(workflowId).map { it.toDto() }
    }

    @Transactional
    fun handleWebhook(token: String, payload: JsonNode?): Long {
        val trigger = triggers.findByToken(token) ?: throw NotFoundException("Webhook not found")
        return runEnqueueService.enqueue(trigger.workflowId, payload, startNodeId = trigger.nodeId, triggerType = "webhook")
    }

    @Transactional
    fun syncFromGraph(workflowId: UUID, graph: WorkflowGraph) {
        val triggerNodes = graph.nodes.filter {
            it.type?.startsWith(TRIGGER_TYPE_PREFIX) == true && it.type != "trigger.manual"
        }
        val keepNodeIds = triggerNodes.map { it.id }

        val staleIds = triggers.deleteByWorkflowIdAndNodeIdNotIn(workflowId, keepNodeIds)

        val upserted = mutableListOf<TriggersRepository.TriggerRow>()
        triggerNodes.forEach { node ->
            val subtype = node.type!!.substring(TRIGGER_TYPE_PREFIX.length)
            if (subtype !in setOf("webhook", "cron", "interval")) {
                throw BadRequestException("Unknown trigger subtype: $subtype (node ${node.id})")
            }
            val userConfig = stripMetaKeys(node.data?.config)
            validateConfig(subtype, userConfig)

            val existing = triggers.findByWorkflowAndNode(workflowId, node.id)
            val token = if (subtype == "webhook") {
                existing?.token ?: generateToken()
            } else null

            val configJson = userConfig?.let { objectMapper.writeValueAsString(it) }
            triggers.upsertByWorkflowAndNode(
                workflowId = workflowId,
                nodeId = node.id,
                type = subtype,
                configJson = configJson,
                token = token,
            )
            triggers.findByWorkflowAndNode(workflowId, node.id)?.let { upserted.add(it) }
        }

        registerAfterCommit {
            staleIds.forEach { scheduler.cancel(it) }
            upserted.forEach { row ->
                if ((row.type == "cron" || row.type == "interval") && row.enabled) {
                    scheduler.schedule(row)
                } else if (row.type == "cron" || row.type == "interval") {
                    scheduler.cancel(row.id)
                }
            }
        }
    }

    @Transactional
    fun setEnabled(workflowId: UUID, triggerId: Long, enabled: Boolean): Trigger {
        val row = triggers.findById(triggerId) ?: throw NotFoundException("Trigger not found")
        if (row.workflowId != workflowId) {
            throw NotFoundException("Trigger not found")
        }
        if (row.enabled == enabled) {
            return row.toDto()
        }
        triggers.setEnabled(triggerId, enabled)
        val updated = triggers.findById(triggerId) ?: throw NotFoundException("Trigger not found")
        registerAfterCommit {
            if (updated.type == "cron" || updated.type == "interval") {
                if (enabled) {
                    scheduler.schedule(updated)
                } else {
                    scheduler.cancel(triggerId)
                }
            }
        }
        return updated.toDto()
    }

    private fun stripMetaKeys(config: JsonNode?): ObjectNode? {
        if (config == null || !config.isObject) return null
        val copy = (config as ObjectNode).deepCopy() as ObjectNode
        val fields = copy.fieldNames().asSequence().toList()
        fields.forEach { name -> if (name.startsWith("__")) copy.remove(name) }
        return if (copy.isEmpty) null else copy
    }

    private fun registerAfterCommit(action: () -> Unit) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = action()
            })
        } else {
            action()
        }
    }

    private fun validateConfig(subtype: String, config: JsonNode?) {
        when (subtype) {
            "cron" -> {
                val cron = (config?.get("cron") ?: config?.get("expression"))?.asText()
                if (cron.isNullOrBlank()) throw BadRequestException("cron trigger requires config.expression")
                try {
                    CronExpressions.normalize(cron)
                } catch (ex: IllegalArgumentException) {
                    throw BadRequestException(ex.message ?: "Invalid cron expression")
                }
            }

            "interval" -> {
                val seconds = (config?.get("everySeconds") ?: config?.get("periodSeconds"))?.asLong()
                if (seconds == null || seconds <= 0) throw BadRequestException("interval trigger requires config.periodSeconds > 0")
            }
        }
    }

    private fun generateToken(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun TriggersRepository.TriggerRow.toDto(): Trigger =
        Trigger(
            id = this.id.toString(),
            workflowId = this.workflowId.toString(),
            nodeId = this.nodeId,
            type = this.type,
            config = this.configJson?.let { objectMapper.readTree(it) },
            token = this.token,
            enabled = this.enabled,
        )
}
