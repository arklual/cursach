package ru.startem.aelevena.api

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.http.HttpStatus
import org.springframework.web.bind.MethodArgumentNotValidException

/**
 * Direct unit coverage for RestExceptionHandler — the integration test only exercises
 * MockMvc paths, which leaves the `?: fallback` branches in the handler uncovered.
 */
class RestExceptionHandlerTest {

    private val handler = RestExceptionHandler()

    @Test
    fun `notFound returns 404 with exception message`() {
        val resp = handler.notFound(NotFoundException("missing widget"))
        assertEquals(HttpStatus.NOT_FOUND, resp.statusCode)
        assertEquals("missing widget", resp.body!!.message)
    }

    @Test
    fun `badRequest returns 400 with exception message`() {
        val resp = handler.badRequest(BadRequestException("bad input"))
        assertEquals(HttpStatus.BAD_REQUEST, resp.statusCode)
        assertEquals("bad input", resp.body!!.message)
    }

    @Test
    fun `validation returns 400 with generic message`() {
        val resp = handler.validation(mock(MethodArgumentNotValidException::class.java))
        assertEquals(HttpStatus.BAD_REQUEST, resp.statusCode)
        assertEquals("Validation failed", resp.body!!.message)
    }

    @Test
    fun `ApiError data class equals and copy`() {
        val a = RestExceptionHandler.ApiError("x")
        val b = a.copy()
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }

    @Test
    fun `ApiException hierarchy carries message`() {
        val api = ApiException("api err")
        val nf = NotFoundException("nf err")
        val br = BadRequestException("br err")
        assertEquals("api err", api.message)
        assertEquals("nf err", nf.message)
        assertEquals("br err", br.message)
    }
}
