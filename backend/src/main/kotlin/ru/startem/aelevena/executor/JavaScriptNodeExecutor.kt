package ru.startem.aelevena.executor

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class JavaScriptNodeExecutor(
    private val objectMapper: ObjectMapper,
    private val sandbox: ContainerSandboxRunner,
) : NodeExecutor {
    override val type: String = "javascript"

    override fun execute(nodeId: String, config: JsonNode?, input: JsonNode): JsonNode {
        val code = config?.get("code")?.asText()
            ?: throw IllegalArgumentException("javascript node requires config.code")

        val timeoutSeconds = config.get("timeoutSeconds")?.asLong() ?: 5L
        val image = config.get("image")?.asText()?.takeIf { it.isNotBlank() } ?: DEFAULT_IMAGE

        val payload = objectMapper.createObjectNode().apply {
            put("code", code)
            set<JsonNode>("input", input)
        }

        return sandbox.run(
            label = "javascript node",
            image = image,
            runtimeCommand = listOf("node", "-e", RUNNER),
            payload = payload,
            codeTimeoutSeconds = timeoutSeconds,
        )
    }

    companion object {
        const val DEFAULT_IMAGE: String = "node:20-alpine"

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
