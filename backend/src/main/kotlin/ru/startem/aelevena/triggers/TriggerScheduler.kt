package ru.startem.aelevena.triggers

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.context.event.EventListener
import org.springframework.scheduling.TaskScheduler
import org.springframework.scheduling.support.CronTrigger
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.BadRequestException
import ru.startem.aelevena.run.RunEnqueueService
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ScheduledFuture

@Component
class TriggerScheduler(
    private val triggers: TriggersRepository,
    private val taskScheduler: TaskScheduler,
    private val runEnqueueService: RunEnqueueService,
    private val objectMapper: ObjectMapper,
) {
    private val scheduled: MutableMap<Long, ScheduledFuture<*>> = ConcurrentHashMap()

    @EventListener(org.springframework.boot.context.event.ApplicationReadyEvent::class)
    fun onReady() {
        triggers.listEnabledScheduled().forEach { schedule(it) }
    }

    fun schedule(trigger: TriggersRepository.TriggerRow) {
        cancel(trigger.id)

        val config = trigger.configJson?.let { objectMapper.readTree(it) }
        val future = when (trigger.type) {
            "cron" -> {
                val cron = config?.get("cron")?.asText()?.takeIf { it.isNotBlank() }
                    ?: throw BadRequestException("cron trigger requires config.cron")
                taskScheduler.schedule(
                    Runnable { fire(trigger) },
                    CronTrigger(cron),
                )
            }

            "interval" -> {
                val everySeconds = config?.get("everySeconds")?.asLong()
                    ?: throw BadRequestException("interval trigger requires config.everySeconds")
                taskScheduler.scheduleAtFixedRate(
                    Runnable { fire(trigger) },
                    Duration.ofSeconds(everySeconds),
                )
            }

            else -> null
        }

        if (future != null) {
            scheduled[trigger.id] = future
        }
    }

    fun cancel(triggerId: Long) {
        scheduled.remove(triggerId)?.cancel(false)
    }

    private fun fire(trigger: TriggersRepository.TriggerRow) {
        runEnqueueService.enqueue(
            workflowId = trigger.workflowId,
            input = inputForTrigger(trigger),
            startNodeId = trigger.nodeId,
        )
    }

    private fun inputForTrigger(trigger: TriggersRepository.TriggerRow) =
        objectMapper.createObjectNode()
            .put("triggerId", trigger.id)
            .put("triggerType", trigger.type)
            .put("triggerNodeId", trigger.nodeId)
}
