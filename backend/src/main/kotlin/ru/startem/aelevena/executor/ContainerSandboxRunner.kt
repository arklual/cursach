package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

@Component
class ContainerSandboxRunner(
    private val objectMapper: ObjectMapper,
) {

    fun run(
        label: String,
        image: String,
        runtimeCommand: List<String>,
        payload: JsonNode,
        codeTimeoutSeconds: Long,
    ): JsonNode {
        val process = ProcessBuilder(buildDockerCommand(image, runtimeCommand))
            .redirectErrorStream(true)
            .start()

        process.outputStream.use { stdin ->
            stdin.write(objectMapper.writeValueAsBytes(payload))
            stdin.flush()
        }

        val processTimeoutSeconds = codeTimeoutSeconds + OVERHEAD_BUDGET_SECONDS
        val finished = process.waitFor(processTimeoutSeconds, TimeUnit.SECONDS)
        if (!finished) {
            process.destroyForcibly()
            throw RuntimeException(
                "$label timed out after ${processTimeoutSeconds}s " +
                    "(code budget ${codeTimeoutSeconds}s + container overhead ${OVERHEAD_BUDGET_SECONDS}s)"
            )
        }

        val stdout = process.inputStream.readAllBytes().toString(StandardCharsets.UTF_8)
        if (process.exitValue() != 0) {
            throw RuntimeException("$label failed: $stdout")
        }

        return try {
            objectMapper.readTree(stdout)
        } catch (_: Exception) {
            objectMapper.createObjectNode().put("raw", stdout)
        }
    }

    private fun buildDockerCommand(image: String, runtimeCommand: List<String>): List<String> {
        return listOf(
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
        ) + runtimeCommand
    }

    companion object {
        private const val OVERHEAD_BUDGET_SECONDS = 30L
    }
}
