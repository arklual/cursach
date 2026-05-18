package ru.startem.aelevena.workflow.model

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ConnectionSkeletonTest {
    private val mapper = jacksonObjectMapper()

    @Test
    fun `variant сериализуется и десериализуется`() {
        val original = ConnectionSkeleton(id = "e1", source = "a", target = "b", variant = "A")
        val json = mapper.writeValueAsString(original)
        val back = mapper.readValue(json, ConnectionSkeleton::class.java)
        assertEquals("A", back.variant)
    }

    @Test
    fun `variant null по умолчанию для обратной совместимости`() {
        val json = """{"id":"e1","source":"a","target":"b"}"""
        val back = mapper.readValue(json, ConnectionSkeleton::class.java)
        assertNull(back.variant)
    }
}
