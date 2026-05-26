package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class InputTemplateTest {

    private val om = ObjectMapper()

    private fun envelope(): com.fasterxml.jackson.databind.JsonNode = om.readTree(
        """
        {
          "runInput": {"userId": "u42", "tags": ["a", "b"]},
          "inputs": {
            "fetchUser": {
              "statusCode": 200,
              "body": {"name": "Alice", "items": [{"id": 1}, {"id": 2}]}
            },
            "with-dash": {"v": "ok"}
          }
        }
        """.trimIndent()
    )

    @Test
    fun `inserts string value from path`() {
        assertEquals(
            "https://api.example.com/u/u42",
            InputTemplate.render("https://api.example.com/u/\${runInput.userId}", envelope(), om),
        )
    }

    @Test
    fun `serializes non-string values as JSON`() {
        val out = InputTemplate.render("\${runInput.tags}", envelope(), om)
        assertEquals("[\"a\",\"b\"]", out)
    }

    @Test
    fun `supports bracket notation for keys with special chars`() {
        val out = InputTemplate.render("\${inputs[\"with-dash\"].v}", envelope(), om)
        assertEquals("ok", out)
    }

    @Test
    fun `supports array index access via brackets and dots`() {
        assertEquals("1", InputTemplate.render("\${inputs.fetchUser.body.items[0].id}", envelope(), om))
        assertEquals("2", InputTemplate.render("\${inputs.fetchUser.body.items.1.id}", envelope(), om))
    }

    @Test
    fun `missing path becomes empty string instead of error`() {
        assertEquals("/no/", InputTemplate.render("/\${runInput.unknown.deep}no/", envelope(), om))
    }

    @Test
    fun `no placeholders means string is returned as-is`() {
        assertEquals("plain string", InputTemplate.render("plain string", envelope(), om))
    }

    @Test
    fun `renderNode walks objects and arrays recursively`() {
        val body = om.readTree(
            """
            {
              "user": "${'$'}{runInput.userId}",
              "tags": ["${'$'}{runInput.tags[0]}", "static"]
            }
            """.trimIndent()
        )
        val rendered = InputTemplate.renderNode(body, envelope(), om)
        assertEquals("u42", rendered.get("user").asText())
        assertEquals("a", rendered.get("tags").get(0).asText())
        assertEquals("static", rendered.get("tags").get(1).asText())
    }

    @Test
    fun `renderNode passes non-string scalars through unchanged`() {
        val body = om.readTree("""{"n": 42, "ok": true}""")
        val rendered = InputTemplate.renderNode(body, envelope(), om)
        assertEquals(42, rendered.get("n").asInt())
        assertEquals(true, rendered.get("ok").asBoolean())
    }
}
