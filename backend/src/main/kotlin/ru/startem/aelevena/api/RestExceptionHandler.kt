package ru.startem.aelevena.api

import io.swagger.v3.oas.annotations.media.Schema
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.time.OffsetDateTime
import java.util.UUID

@RestControllerAdvice
class RestExceptionHandler {

    private val log = LoggerFactory.getLogger(javaClass)

    @Schema(description = "Описание одного нарушения валидации поля запроса")
    data class FieldViolation(
        @get:Schema(description = "Имя поля, не прошедшего валидацию", example = "name")
        val field: String,
        @get:Schema(description = "Человекочитаемое описание нарушения", example = "must not be blank")
        val message: String,
    )

    @Schema(description = "Единый формат тела ошибки REST API с машинно-читаемым кодом")
    data class ApiError(
        @get:Schema(description = "Машинно-читаемый код ошибки", example = "not_found")
        val errorCode: String,
        @get:Schema(description = "Человекочитаемое сообщение об ошибке")
        val message: String,
        @get:Schema(description = "Нарушения валидации по полям (заполняется для errorCode=validation_failed)")
        val violations: List<FieldViolation> = emptyList(),
        @get:Schema(description = "Идентификатор корреляции для поиска ошибки в серверных логах")
        val correlationId: String = UUID.randomUUID().toString(),
        @get:Schema(description = "Момент формирования ответа об ошибке (ISO-8601)")
        val timestamp: OffsetDateTime = OffsetDateTime.now(),
    )

    @ExceptionHandler(NotFoundException::class)
    fun notFound(ex: NotFoundException): ResponseEntity<ApiError> =
        error(HttpStatus.NOT_FOUND, "not_found", ex.message ?: "Not found")

    @ExceptionHandler(BadRequestException::class)
    fun badRequest(ex: BadRequestException): ResponseEntity<ApiError> =
        error(HttpStatus.BAD_REQUEST, "bad_request", ex.message ?: "Bad request")

    @ExceptionHandler(ConflictException::class)
    fun conflict(ex: ConflictException): ResponseEntity<ApiError> =
        error(HttpStatus.CONFLICT, "conflict", ex.message ?: "Conflict")

    @ExceptionHandler(IllegalArgumentException::class)
    fun illegalArgument(ex: IllegalArgumentException): ResponseEntity<ApiError> =
        error(HttpStatus.BAD_REQUEST, "bad_request", ex.message ?: "Bad request")

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(ex: HttpMessageNotReadableException): ResponseEntity<ApiError> =
        error(HttpStatus.BAD_REQUEST, "bad_request", "Malformed request body")

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun validation(ex: MethodArgumentNotValidException): ResponseEntity<ApiError> {
        val violations = ex.bindingResult.fieldErrors.map {
            FieldViolation(field = it.field, message = it.defaultMessage ?: "invalid")
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ApiError(errorCode = "validation_failed", message = "Validation failed", violations = violations),
        )
    }

    @ExceptionHandler(Exception::class)
    fun internal(ex: Exception): ResponseEntity<ApiError> {
        if (ex is org.springframework.web.ErrorResponse) {
            val status = ex.statusCode
            val code = when {
                status.value() == 404 -> "not_found"
                status.value() == 405 -> "method_not_allowed"
                status.value() == 415 -> "unsupported_media_type"
                status.is4xxClientError -> "bad_request"
                else -> "internal_error"
            }
            return ResponseEntity.status(status).body(ApiError(errorCode = code, message = ex.body.detail ?: status.toString()))
        }
        val body = ApiError(errorCode = "internal_error", message = "Internal server error")
        log.error("Unhandled error [correlationId={}]", body.correlationId, ex)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body)
    }

    private fun error(status: HttpStatus, code: String, message: String): ResponseEntity<ApiError> =
        ResponseEntity.status(status).body(ApiError(errorCode = code, message = message))
}
