package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.Comparator
import java.util.concurrent.TimeUnit

@Component
class JavaScriptNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "javascript"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val code = config?.get("code")?.asText()
            ?: throw IllegalArgumentException("javascript node requires config.code")

        val timeoutSeconds = config?.get("timeoutSeconds")?.asLong() ?: 5L
        val image = config?.get("image")?.asText()?.takeIf { it.isNotBlank() } ?: "node:20-alpine"

        val tmpDir = Files.createTempDirectory("a11a-js-")
        try {
            writeFile(tmpDir.resolve("user_code.js"), code)
            writeFile(tmpDir.resolve("runner.js"), runnerJs())

            val cmd = listOf(
                "docker",
                "run",
                "--rm",
                "--network",
                "none",
                "--memory",
                "256m",
                "--cpus",
                "1",
                "-i",
                "-v",
                "${tmpDir.toAbsolutePath()}:/work:ro",
                "-w",
                "/work",
                image,
                "node",
                "runner.js",
            )

            val process = ProcessBuilder(cmd)
                .redirectErrorStream(true)
                .start()

            process.outputStream.use { stdin ->
                stdin.write(objectMapper.writeValueAsBytes(input))
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
        } finally {
            deleteRecursively(tmpDir)
        }
    }

    private fun writeFile(path: Path, content: String) {
        Files.writeString(path, content, StandardCharsets.UTF_8)
    }

    private fun deleteRecursively(path: Path) {
        if (!Files.exists(path)) return
        Files.walk(path).use { stream ->
            stream
                .sorted(Comparator.reverseOrder())
                .forEach { Files.deleteIfExists(it) }
        }
    }

    private fun runnerJs(): String =
        """
        const fs = require('fs');

        async function main() {
            let inputRaw = '';
            for await (const chunk of process.stdin) inputRaw += chunk;
            const input = inputRaw.trim().length ? JSON.parse(inputRaw) : null;

            try {
                const userCode = fs.readFileSync('/work/user_code.js', 'utf-8');
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                const wrapped = new AsyncFunction('input', userCode + `
                    if (typeof run === 'function') return await run(input);
                    if (typeof output !== 'undefined') return output;
                    return null;
                `);
                const result = await wrapped(input);
                process.stdout.write(JSON.stringify({ result }));
            } catch (e) {
                process.stdout.write(JSON.stringify({
                    error: String(e && e.message ? e.message : e),
                    trace: e && e.stack ? e.stack : null,
                }));
                process.exit(1);
            }
        }

        main();
        """.trimIndent()
}
