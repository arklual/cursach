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
    @Operation(
        summary = "Старт сессии пошаговой отладки",
        description = "Создаёт новую сессию пошаговой отладки для указанного workflow с опциональным входом " +
            "и стартовой нодой; возвращает состояние созданной сессии. Ошибки возможны, если workflow не найден " +
            "или стартовая нода некорректна.",
    )
    fun start(
        @PathVariable workflowId: UUID,
        @RequestBody(required = false) body: DebugStartRequest?,
    ): DebugSessionDto = debugSessions.start(
        workflowId = workflowId,
        input = body?.input,
        startNodeId = body?.startNodeId,
    )

    @GetMapping("/debug-sessions/{sessionId}")
    @Operation(
        summary = "Получить состояние сессии отладки",
        description = "Возвращает текущее состояние сессии пошаговой отладки по её идентификатору. " +
            "Если сессия с указанным идентификатором не найдена, возвращается ошибка.",
    )
    fun get(@PathVariable sessionId: String): DebugSessionDto =
        debugSessions.get(sessionId)

    @PostMapping("/debug-sessions/{sessionId}/step")
    @Operation(
        summary = "Выполнить один шаг отладки",
        description = "Исполняет один шаг (одну ноду) в рамках сессии пошаговой отладки; при указании nodeId " +
            "выполняется конкретная нода. Возвращает обновлённое состояние сессии. Ошибки возможны, если сессия " +
            "не найдена или указанная нода недоступна для исполнения.",
    )
    fun step(
        @PathVariable sessionId: String,
        @RequestBody(required = false) body: DebugStepRequest?,
    ): DebugSessionDto = debugSessions.step(sessionId, body?.nodeId)

    @PostMapping("/debug-sessions/{sessionId}/run-to-end")
    @Operation(
        summary = "Доисполнить сессию отладки до конца",
        description = "Прогоняет сессию пошаговой отладки до завершения графа, начиная с текущего состояния, " +
            "и возвращает финальное состояние сессии. Если сессия не найдена, возвращается ошибка.",
    )
    fun runToEnd(@PathVariable sessionId: String): DebugSessionDto =
        debugSessions.runToEnd(sessionId)

    @DeleteMapping("/debug-sessions/{sessionId}")
    @Operation(
        summary = "Закрыть сессию отладки",
        description = "Завершает и удаляет сессию пошаговой отладки по её идентификатору, освобождая связанные ресурсы. " +
            "Ничего не возвращает; при отсутствии сессии возможна ошибка.",
    )
    fun close(@PathVariable sessionId: String) {
        debugSessions.close(sessionId)
    }
}
