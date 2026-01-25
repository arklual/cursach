package ru.startem.aelevena.api

import com.fasterxml.jackson.databind.JsonNode
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.Trigger
import ru.startem.aelevena.api.dto.TriggerCreateRequest
import ru.startem.aelevena.triggers.TriggerService
import java.util.UUID

@RestController
class TriggersController(
    private val triggerService: TriggerService,
) {
    @PostMapping("/workflows/{workflowId}/triggers")
    fun create(
        @PathVariable workflowId: UUID,
        @Valid @RequestBody body: TriggerCreateRequest,
    ): ResponseEntity<Trigger> =
        ResponseEntity.status(HttpStatus.CREATED).body(triggerService.create(workflowId, body))

    @GetMapping("/workflows/{workflowId}/triggers")
    fun list(@PathVariable workflowId: UUID): List<Trigger> =
        triggerService.list(workflowId)

    @DeleteMapping("/triggers/{triggerId}")
    fun delete(@PathVariable triggerId: Long): ResponseEntity<Void> {
        triggerService.delete(triggerId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/webhook/{token}")
    fun webhook(
        @PathVariable token: String,
        @RequestBody(required = false) payload: JsonNode?,
    ): ResponseEntity<Void> {
        triggerService.handleWebhook(token, payload)
        return ResponseEntity.accepted().build()
    }
}

