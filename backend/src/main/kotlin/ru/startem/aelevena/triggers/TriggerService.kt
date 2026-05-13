package ru.startem.aelevena.triggers

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.api.NotFoundException
import ru.startem.aelevena.api.dto.Trigger
import ru.startem.aelevena.api.dto.TriggerCreateRequest
import ru.startem.aelevena.run.RunEnqueueService
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

@Service
class TriggerService(
    private val triggers: TriggersRepository,
    private val workflows: WorkflowsRepository,
    private val scheduler: TriggerScheduler,
    private val runEnqueueService: RunEnqueueService,
    private val objectMapper: ObjectMapper,
) {
    private val random = SecureRandom()

    @Transactional
    fun create(workflowId: UUID, req: TriggerCreateRequest): Trigger {
        if (workflows.findById(workflowId) == null) {
            throw NotFoundException("Workflow not found")
        }

        val (token, configNode) = when (req.type) {
            "webhook" -> {
                val token = generateToken()
                val cfg = mergeTokenIntoConfig(req.config, token)
                token to cfg
            }

            else -> null to req.config
        }

        validateConfig(req.type, configNode)

        val configJson = configNode?.let { objectMapper.writeValueAsString(it) }
        val triggerId = triggers.insert(workflowId = workflowId, type = req.type, configJson = configJson, token = token)
        val row = triggers.findById(triggerId) ?: throw IllegalStateException("Just inserted trigger not found")

        if (row.type == "cron" || row.type == "interval") {
            scheduler.schedule(row)
        }

        return row.toDto()
    }

    fun list(workflowId: UUID): List<Trigger> {
        if (workflows.findById(workflowId) == null) {
            throw NotFoundException("Workflow not found")
        }
        return triggers.listByWorkflow(workflowId).map { it.toDto() }
    }

    @Transactional
    fun delete(triggerId: Long) {
        val row = triggers.findById(triggerId) ?: throw NotFoundException("Trigger not found")
        scheduler.cancel(triggerId)
        if (!triggers.delete(triggerId)) {
            throw NotFoundException("Trigger not found")
        }
    }

    @Transactional
    fun handleWebhook(token: String, payload: JsonNode?): Long {
        val trigger = triggers.findByToken(token) ?: throw NotFoundException("Webhook not found")
        return runEnqueueService.enqueue(trigger.workflowId, payload)
    }

    private fun validateConfig(type: String, config: JsonNode?) {
        when (type) {
            "cron" -> {
                val cron = config?.get("cron")?.asText()
                if (cron.isNullOrBlank()) throw BadRequestException("cron trigger requires config.cron")
            }

            "interval" -> {
                val seconds = config?.get("everySeconds")?.asLong()
                if (seconds == null || seconds <= 0) throw BadRequestException("interval trigger requires config.everySeconds > 0")
            }
        }
    }

    private fun mergeTokenIntoConfig(config: JsonNode?, token: String): ObjectNode {
        val obj = when (config) {
            null -> objectMapper.createObjectNode()
            is ObjectNode -> (config as ObjectNode).deepCopy()
            else -> throw BadRequestException("webhook trigger config must be an object")
        }
        if (obj.get("token") == null) {
            obj.put("token", token)
        }
        return obj
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
            type = this.type,
            config = this.configJson?.let { objectMapper.readTree(it) },
        )
}

