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
class PythonNodeExecutor(
    private val objectMapper: ObjectMapper,
) : NodeExecutor {
    override val type: String = "python"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val code = config?.get("code")?.asText()
            ?: throw IllegalArgumentException("python node requires config.code")

        val timeoutSeconds = config?.get("timeoutSeconds")?.asLong() ?: 5L
        val image = config?.get("image")?.asText()?.takeIf { it.isNotBlank() } ?: "python:3.12-alpine"

        val tmpDir = Files.createTempDirectory("a11a-python-")
        try {
            writeFile(tmpDir.resolve("user_code.py"), code)
            writeFile(tmpDir.resolve("runner.py"), runnerPy())

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
                "python",
                "runner.py",
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

    private fun runnerPy(): String =
        """
        import json
        import sys
        import traceback
        
        def main():
            inp = json.load(sys.stdin)
            try:
                import user_code
                if hasattr(user_code, "run") and callable(user_code.run):
                    result = user_code.run(inp)
                elif hasattr(user_code, "output"):
                    result = user_code.output
                else:
                    result = None
                json.dump({"result": result}, sys.stdout)
            except Exception as e:
                json.dump({"error": str(e), "trace": traceback.format_exc()}, sys.stdout)
                sys.exit(1)
        
        if __name__ == "__main__":
            main()
        """.trimIndent()
}

