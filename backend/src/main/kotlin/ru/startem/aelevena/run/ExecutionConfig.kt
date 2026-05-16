package ru.startem.aelevena.run

import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import java.util.concurrent.atomic.AtomicInteger

@Configuration
class ExecutionConfig {
    private val log = LoggerFactory.getLogger(javaClass)

    @Bean(destroyMethod = "shutdown")
    fun workflowExecutor(): ExecutorService {
        val counter = AtomicInteger(0)
        val factory = ThreadFactory { runnable ->
            Thread(runnable, "workflow-exec-${counter.incrementAndGet()}").apply {
                isDaemon = false
                uncaughtExceptionHandler = Thread.UncaughtExceptionHandler { t, ex ->
                    log.error("Uncaught error in workflow executor thread {}", t.name, ex)
                }
            }
        }
        return Executors.newFixedThreadPool(
            maxOf(4, Runtime.getRuntime().availableProcessors()),
            factory,
        )
    }
}

