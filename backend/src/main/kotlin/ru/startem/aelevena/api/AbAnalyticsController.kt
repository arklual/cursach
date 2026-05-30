package ru.startem.aelevena.api

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import ru.startem.aelevena.analytics.AbAnalyticsResponse
import ru.startem.aelevena.analytics.AbAnalyticsService
import java.util.UUID

@RestController
@Tag(name = "Analytics", description = "Сводная A/B-аналитика workflow (конверсии, доверительные интервалы, z-тест)")
class AbAnalyticsController(
    private val service: AbAnalyticsService,
) {
    @Operation(
        summary = "Получить A/B-аналитику по узлу разделения потока",
        description = "Вычисляет и возвращает сводную A/B-аналитику для указанного узла разделения (abNodeId) внутри workflow: конверсии веток, доверительные интервалы и результаты z-теста. Параметр abNodeId обязателен; при пустом значении возвращается 400 Bad Request. Если workflow или узел не найдены, возвращается соответствующая ошибка.",
    )
    @GetMapping("/workflows/{workflowId}/ab-analytics")
    fun get(
        @PathVariable workflowId: UUID,
        @RequestParam(required = true) abNodeId: String,
    ): AbAnalyticsResponse {
        if (abNodeId.isBlank()) throw BadRequestException("abNodeId is required")
        return service.compute(workflowId, abNodeId)
    }
}
