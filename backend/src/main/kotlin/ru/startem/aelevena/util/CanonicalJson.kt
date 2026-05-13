package ru.startem.aelevena.util

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import org.springframework.stereotype.Component

@Component
class CanonicalJson(
    objectMapper: ObjectMapper,
) {
    private val canonicalMapper: ObjectMapper = objectMapper.copy()
        .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
        .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)

    fun writeBytes(value: Any): ByteArray = canonicalMapper.writeValueAsBytes(value)

    fun readTree(bytes: ByteArray): JsonNode = canonicalMapper.readTree(bytes)

    fun <T> read(bytes: ByteArray, clazz: Class<T>): T = canonicalMapper.readValue(bytes, clazz)
}

