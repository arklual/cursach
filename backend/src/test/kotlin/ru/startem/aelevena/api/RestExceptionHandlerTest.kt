package ru.startem.aelevena.api

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.core.MethodParameter
import org.springframework.http.HttpInputMessage
import org.springframework.http.HttpStatus
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.BeanPropertyBindingResult
import org.springframework.validation.FieldError
import org.springframework.web.bind.MethodArgumentNotValidException

class RestExceptionHandlerTest {

    private val handler = RestExceptionHandler()

    @Suppress("unused")
    fun dummy(arg: String) {
    }

    @Test
    fun `notFound returns 404 with not_found code`() {
        val resp = handler.notFound(NotFoundException("missing widget"))
        assertEquals(HttpStatus.NOT_FOUND, resp.statusCode)
        assertEquals("not_found", resp.body!!.errorCode)
        assertEquals("missing widget", resp.body!!.message)
        assertFalse(resp.body!!.correlationId.isBlank())
    }

    @Test
    fun `badRequest returns 400 with bad_request code`() {
        val resp = handler.badRequest(BadRequestException("bad input"))
        assertEquals(HttpStatus.BAD_REQUEST, resp.statusCode)
        assertEquals("bad_request", resp.body!!.errorCode)
        assertEquals("bad input", resp.body!!.message)
    }

    @Test
    fun `conflict returns 409 with conflict code`() {
        val resp = handler.conflict(ConflictException("already restored"))
        assertEquals(HttpStatus.CONFLICT, resp.statusCode)
        assertEquals("conflict", resp.body!!.errorCode)
        assertEquals("already restored", resp.body!!.message)
    }

    @Test
    fun `illegalArgument maps to 400 bad_request`() {
        val resp = handler.illegalArgument(IllegalArgumentException("nope"))
        assertEquals(HttpStatus.BAD_REQUEST, resp.statusCode)
        assertEquals("bad_request", resp.body!!.errorCode)
    }

    @Test
    fun `unreadable body maps to 400 bad_request`() {
        val resp = handler.unreadable(HttpMessageNotReadableException("broken", mock(HttpInputMessage::class.java)))
        assertEquals(HttpStatus.BAD_REQUEST, resp.statusCode)
        assertEquals("bad_request", resp.body!!.errorCode)
    }

    @Test
    fun `internal error returns 500 internal_error with correlationId`() {
        val resp = handler.internal(RuntimeException("boom"))
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.statusCode)
        assertEquals("internal_error", resp.body!!.errorCode)
        assertFalse(resp.body!!.correlationId.isBlank())
    }

    @Test
    fun `validation returns 400 validation_failed with per-field violations`() {
        val method = this::class.java.getDeclaredMethod("dummy", String::class.java)
        val parameter = MethodParameter(method, 0)
        val binding = BeanPropertyBindingResult(Any(), "request")
        binding.addError(FieldError("request", "name", "must not be blank"))
        val ex = MethodArgumentNotValidException(parameter, binding)

        val resp = handler.validation(ex)
        assertEquals(HttpStatus.BAD_REQUEST, resp.statusCode)
        assertEquals("validation_failed", resp.body!!.errorCode)
        assertEquals(1, resp.body!!.violations.size)
        assertEquals("name", resp.body!!.violations.first().field)
        assertEquals("must not be blank", resp.body!!.violations.first().message)
    }

    @Test
    fun `ApiError data class equals and copy`() {
        val a = RestExceptionHandler.ApiError(errorCode = "x", message = "m", correlationId = "fixed")
        val b = a.copy()
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }

    @Test
    fun `ApiException hierarchy carries message`() {
        assertEquals("api err", ApiException("api err").message)
        assertEquals("nf err", NotFoundException("nf err").message)
        assertEquals("br err", BadRequestException("br err").message)
        assertEquals("cf err", ConflictException("cf err").message)
        assertTrue(ConflictException("x") is ApiException)
    }
}
