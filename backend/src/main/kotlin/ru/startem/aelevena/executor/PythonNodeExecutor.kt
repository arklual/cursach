package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class PythonNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val sandbox: ContainerSandboxRunner,
) : NodeExecutor {
    override val type: String = "python"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val code = config?.get("code")?.asText()
            ?: throw IllegalArgumentException("python node requires config.code")

        val timeoutSeconds = config.get("timeoutSeconds")?.asLong() ?: 5L
        val image = config.get("image")?.asText()?.takeIf { it.isNotBlank() } ?: DEFAULT_IMAGE

        val payload = objectMapper.createObjectNode().apply {
            put("code", code)
            set<JsonNode>("input", input)
        }

        return sandbox.run(
            label = "python node",
            image = image,
            runtimeCommand = listOf("python", "-c", RUNNER),
            payload = payload,
            codeTimeoutSeconds = timeoutSeconds,
        )
    }

    companion object {
        const val DEFAULT_IMAGE: String = "python:3.11-slim"

        private val RUNNER = """
            import json, sys, traceback
            payload = json.loads(sys.stdin.read())
            code = payload.get("code", "")
            inp = payload.get("input")
            ns = {}
            try:
                exec(code, ns)
                if callable(ns.get("run")):
                    result = ns["run"](inp)
                elif "output" in ns:
                    result = ns["output"]
                else:
                    result = None
                json.dump({"result": result}, sys.stdout)
            except Exception as e:
                json.dump({"error": str(e), "trace": traceback.format_exc()}, sys.stdout)
                sys.exit(1)
        """.trimIndent()
    }
}
