package ru.startem.aelevena.api

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class RestExceptionHandler {

    data class ApiError(val message: String)

    @ExceptionHandler(NotFoundException::class)
    fun notFound(ex: NotFoundException): ResponseEntity<ApiError> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError(ex.message ?: "Not found"))

    @ExceptionHandler(BadRequestException::class)
    fun badRequest(ex: BadRequestException): ResponseEntity<ApiError> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiError(ex.message ?: "Bad request"))

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun validation(ex: MethodArgumentNotValidException): ResponseEntity<ApiError> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiError("Validation failed"))
}

