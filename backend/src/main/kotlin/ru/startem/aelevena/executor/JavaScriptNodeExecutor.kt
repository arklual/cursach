package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

@Component
class JavaScriptNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "javascript"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val code = config?.get("code")?.asText()
            ?: throw IllegalArgumentException("javascript node requires config.code")

        val timeoutSeconds = config.get("timeoutSeconds")?.asLong() ?: 5L
        val image = config.get("image")?.asText()?.takeIf { it.isNotBlank() } ?: "node:20-alpine"

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
            "node", "-e", RUNNER,
        )

        val process = ProcessBuilder(cmd).redirectErrorStream(true).start()

        process.outputStream.use { stdin ->
            stdin.write(objectMapper.writeValueAsBytes(payload))
            stdin.flush()
        }

        val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)
        if (!finished) {
            process.destroyForcibly()
            throw RuntimeException("javascript node timed out after ${timeoutSeconds}s")
        }

        val stdout = process.inputStream.readAllBytes().toString(StandardCharsets.UTF_8)
        if (process.exitValue() != 0) {
            throw RuntimeException("javascript node failed: $stdout")
        }

        return try {
            objectMapper.readTree(stdout)
        } catch (_: Exception) {
            objectMapper.createObjectNode().put("raw", stdout)
        }
    }

    companion object {
        private val RUNNER = """
            let raw = '';
            process.stdin.on('data', c => raw += c);
            process.stdin.on('end', async () => {
                try {
                    const payload = JSON.parse(raw);
                    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                    const wrapped = new AsyncFunction('input', payload.code + `\n` +
                        "if (typeof run === 'function') return await run(input);" +
                        "if (typeof output !== 'undefined') return output;" +
                        "return null;");
                    const result = await wrapped(payload.input);
                    process.stdout.write(JSON.stringify({ result }));
                } catch (e) {
                    process.stdout.write(JSON.stringify({
                        error: String(e && e.message ? e.message : e),
                        trace: e && e.stack ? e.stack : null,
                    }));
                    process.exit(1);
                }
            });
        """.trimIndent()
    }
}
