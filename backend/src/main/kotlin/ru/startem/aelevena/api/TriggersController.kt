package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import ru.startem.aelevena.api.dto.Trigger
import ru.startem.aelevena.api.dto.TriggerUpdate
import ru.startem.aelevena.api.dto.WebhookAccepted
import ru.startem.aelevena.run.RunQueryService
import ru.startem.aelevena.triggers.TriggerService
import java.util.UUID

@RestController
@Tag(name = "Triggers", description = "Управление триггерами (manual, scheduler, webhook) и приём webhook-запросов")
class TriggersController(
    private val triggerService: TriggerService,
    private val runQueryService: RunQueryService,
) {
    @Operation(
        summary = "Список триггеров workflow",
        description = "Возвращает все триггеры (manual, scheduler, webhook), привязанные к указанному workflow. " +
            "Если workflow не найден, возвращается ошибка 404.",
    )
    @GetMapping("/workflows/{workflowId}/triggers")
    fun list(@PathVariable workflowId: UUID): List<Trigger> =
        triggerService.list(workflowId)

    @Operation(
        summary = "Включить или выключить триггер",
        description = "Обновляет состояние enabled указанного триггера workflow и возвращает обновлённый триггер. " +
            "Если workflow или триггер не найдены, возвращается ошибка 404.",
    )
    @PatchMapping("/workflows/{workflowId}/triggers/{triggerId}")
    fun update(
        @PathVariable workflowId: UUID,
        @PathVariable triggerId: Long,
        @RequestBody body: TriggerUpdate,
    ): Trigger = triggerService.setEnabled(workflowId, triggerId, body.enabled)

    @Operation(
        summary = "Приём webhook-запроса",
        description = "Принимает webhook-запрос по токену триггера, запускает соответствующий workflow и возвращает 202 Accepted " +
            "с телом WebhookAccepted и заголовком Location, указывающим URL для опроса результата выполнения. " +
            "Если токен невалиден или триггер не найден, возвращается ошибка 404.",
    )
    @PostMapping("/webhook/{token}")
    fun webhook(
        @PathVariable token: String,
        @RequestBody(required = false) payload: JsonNode?,
    ): ResponseEntity<WebhookAccepted> {
        val runId = triggerService.handleWebhook(token, payload)
        val run = runQueryService.getWorkflowRun(runId)
        val pollUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
            .path("/workflow-runs/{runId}/result")
            .buildAndExpand(runId)
            .toUriString()
        return ResponseEntity.accepted()
            .header(HttpHeaders.LOCATION, pollUrl)
            .body(WebhookAccepted(run = run, pollUrl = pollUrl))
    }
}
