package ru.startem.aelevena.api

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.DebugSessionDto
import ru.startem.aelevena.api.dto.DebugStartRequest
import ru.startem.aelevena.api.dto.DebugStepRequest
import ru.startem.aelevena.run.DebugSessionService
import java.util.UUID

@RestController
class DebugController(
    private val debugSessions: DebugSessionService,
) {
    @PostMapping("/workflows/{workflowId}/debug-sessions")
    fun start(
        @PathVariable workflowId: UUID,
        @RequestBody(required = false) body: DebugStartRequest?,
    ): DebugSessionDto = debugSessions.start(
        workflowId = workflowId,
        input = body?.input,
        startNodeId = body?.startNodeId,
    )

    @GetMapping("/debug-sessions/{sessionId}")
    fun get(@PathVariable sessionId: String): DebugSessionDto =
        debugSessions.get(sessionId)

    @PostMapping("/debug-sessions/{sessionId}/step")
    fun step(
        @PathVariable sessionId: String,
        @RequestBody(required = false) body: DebugStepRequest?,
    ): DebugSessionDto = debugSessions.step(sessionId, body?.nodeId)

    @PostMapping("/debug-sessions/{sessionId}/run-to-end")
    fun runToEnd(@PathVariable sessionId: String): DebugSessionDto =
        debugSessions.runToEnd(sessionId)

    @DeleteMapping("/debug-sessions/{sessionId}")
    fun close(@PathVariable sessionId: String) {
        debugSessions.close(sessionId)
    }
}
