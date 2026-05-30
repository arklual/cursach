package ru.startem.aelevena.executor

import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

@Component
class SandboxImageWarmer {

    @EventListener(ApplicationReadyEvent::class)
    fun onReady() {
        val thread = Thread({ warmAll() }, "sandbox-image-warmer")
        thread.isDaemon = true
        thread.start()
    }

    private fun warmAll() {
        for (image in IMAGES) {
            pull(image)
        }
    }

    private fun pull(image: String) {
        try {
            log.info("Pre-pulling sandbox image: {}", image)
            val process = ProcessBuilder("docker", "pull", image)
                .redirectOutput(ProcessBuilder.Redirect.INHERIT)
                .redirectError(ProcessBuilder.Redirect.INHERIT)
                .start()
            val finished = process.waitFor(PULL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                log.warn(
                    "docker pull {} did not finish within {}s — falling back to lazy pull on first use",
                    image, PULL_TIMEOUT_SECONDS,
                )
                return
            }
            if (process.exitValue() != 0) {
                log.warn(
                    "docker pull {} failed (exit {}) — falling back to lazy pull on first use",
                    image, process.exitValue(),
                )
                return
            }
            log.info("Sandbox image ready: {}", image)
        } catch (e: Exception) {
            log.warn("Failed to pre-pull sandbox image {}: {}", image, e.message)
        }
    }

    companion object {
        private val log = LoggerFactory.getLogger(SandboxImageWarmer::class.java)
        private const val PULL_TIMEOUT_SECONDS = 300L
        private val IMAGES = listOf(
            JavaScriptNodeExecutor.DEFAULT_IMAGE,
            PythonNodeExecutor.DEFAULT_IMAGE,
        )
    }
}
