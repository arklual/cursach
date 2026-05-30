package ru.startem.aelevena.api

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.api.dto.DebugNodeRunRequest
import ru.startem.aelevena.api.dto.DebugNodeRunResult
import ru.startem.aelevena.api.dto.DebugSessionDto
import ru.startem.aelevena.api.dto.DebugStartRequest
import ru.startem.aelevena.api.dto.DebugStepRequest
import ru.startem.aelevena.run.DebugSessionService
import java.util.UUID

@RestController
@Tag(name = "Debug", description = "Пошаговая отладка workflow")
class DebugController(
    private val debugSessions: DebugSessionService,
) {
    @PostMapping("/workflows/{workflowId}/nodes/{nodeId}/debug-run")
    @Operation(
        summary = "Отладочный запуск одной ноды",
        description = "Исполняет одну выбранную ноду с произвольным входом без прогона графа; " +
            "результат возвращается синхронно и фиксируется в истории как отладочный запуск.",
    )
    fun debugRunNode(
        @PathVariable workflowId: UUID,
        @PathVariable nodeId: String,
        @RequestBody(required = false) body: DebugNodeRunRequest?,
    ): DebugNodeRunResult = debugSessions.debugRunNode(workflowId, nodeId, body?.input)

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
