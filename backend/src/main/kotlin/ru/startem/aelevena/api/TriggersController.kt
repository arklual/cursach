package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.JsonNode
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import ru.startem.aelevena.api.dto.Trigger
import ru.startem.aelevena.api.dto.WebhookAccepted
import ru.startem.aelevena.run.RunQueryService
import ru.startem.aelevena.triggers.TriggerService
import java.util.UUID

@RestController
class TriggersController(
    private val triggerService: TriggerService,
    private val runQueryService: RunQueryService,
) {
    @GetMapping("/workflows/{workflowId}/triggers")
    fun list(@PathVariable workflowId: UUID): List<Trigger> =
        triggerService.list(workflowId)

    @PostMapping("/webhook/{token}")
    fun webhook(
        @PathVariable token: String,
        @RequestBody(required = false) payload: JsonNode?,
    ): ResponseEntity<WebhookAccepted> {
        val runId = triggerService.handleWebhook(token, payload)
        val run = runQueryService.getWorkflowRun(runId)
        val pollUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
            .path("/workflow-runs/{runId}")
            .buildAndExpand(runId)
            .toUriString()
        return ResponseEntity.accepted()
            .header(HttpHeaders.LOCATION, pollUrl)
            .body(WebhookAccepted(run = run, pollUrl = pollUrl))
    }
}
