package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

@Component
class PythonNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "python"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val code = config?.get("code")?.asText()
            ?: throw IllegalArgumentException("python node requires config.code")

        val timeoutSeconds = config.get("timeoutSeconds")?.asLong() ?: 5L
        val image = config.get("image")?.asText()?.takeIf { it.isNotBlank() } ?: "python:3.12-alpine"

        // Code + input go over stdin as JSON — no bind mounts (host daemon can't see the backend
        // container's filesystem) and the sandbox container can stay --read-only.
        val payload = objectMapper.createObjectNode().apply {
            put("code", code)
            set<JsonNode>("input", input)
        }

        val cmd = listOf(
            "docker", "run", "--rm", "-i",
            "--network", "none",
            "--read-only",
            "--tmpfs", "/tmp:rw,size=16m",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--memory", "256m",
            "--cpus", "1",
            "--pids-limit", "64",
            image,
            "python", "-c", RUNNER,
        )

        val process = ProcessBuilder(cmd).redirectErrorStream(true).start()

        process.outputStream.use { stdin ->
            stdin.write(objectMapper.writeValueAsBytes(payload))
            stdin.flush()
        }

        val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)
        if (!finished) {
            process.destroyForcibly()
            throw RuntimeException("python node timed out after ${timeoutSeconds}s")
        }

        val stdout = process.inputStream.readAllBytes().toString(StandardCharsets.UTF_8)
        if (process.exitValue() != 0) {
            throw RuntimeException("python node failed: $stdout")
        }

        return try {
            objectMapper.readTree(stdout)
        } catch (_: Exception) {
            objectMapper.createObjectNode().put("raw", stdout)
        }
    }

    companion object {
        // The runner script — passed as a single argv element (no shell escaping).
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
