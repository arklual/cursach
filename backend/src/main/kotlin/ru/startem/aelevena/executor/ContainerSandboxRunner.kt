package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

/**
 * Runs a runtime-specific script inside a locked-down docker sandbox, communicating
 * over stdin/stdout as JSON. Owns all the process I/O — sandbox flags, timeouts,
 * stdin/stdout transfer, exit-code handling and result parsing — so per-language
 * executors only have to describe WHAT to run (image, runtime command, runner
 * script, payload), not HOW.
 */
@Component
class ContainerSandboxRunner(
    private val objectMapper: ObjectMapper,
) {

    /**
     * @param label human-readable name used in timeout / failure messages
     *              (e.g. "javascript node").
     * @param image docker image to run.
     * @param runtimeCommand argv passed after the image — the language runtime and
     *                       its eval flag, e.g. `listOf("node", "-e", RUNNER)`.
     * @param payload JSON written to the container's stdin.
     * @param codeTimeoutSeconds budget for USER CODE only; container cold-start
     *                           overhead is added on top automatically.
     */
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

        // codeTimeoutSeconds bounds USER CODE; container cold-start (image pull, daemon
        // roundtrip via docker-proxy, Alpine + runtime startup) gets its own budget on
        // top — otherwise the very first run times out before user code even starts.
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
