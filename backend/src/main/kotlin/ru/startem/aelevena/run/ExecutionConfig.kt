package ru.startem.aelevena.run

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@Configuration
class ExecutionConfig {
    @Bean(destroyMethod = "shutdown")
    fun workflowExecutor(): ExecutorService =
        Executors.newFixedThreadPool(maxOf(4, Runtime.getRuntime().availableProcessors()))
}

