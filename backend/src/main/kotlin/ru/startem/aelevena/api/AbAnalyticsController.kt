package ru.startem.aelevena.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.analytics.AbAnalyticsResponse
import ru.startem.aelevena.analytics.AbAnalyticsService
import java.util.UUID

@RestController
class AbAnalyticsController(
    private val service: AbAnalyticsService,
) {
    @GetMapping("/workflows/{workflowId}/ab-analytics")
    fun get(
        @PathVariable workflowId: UUID,
        @RequestParam(required = true) abNodeId: String,
    ): AbAnalyticsResponse {
        if (abNodeId.isBlank()) throw BadRequestException("abNodeId is required")
        return service.compute(workflowId, abNodeId)
    }
}
