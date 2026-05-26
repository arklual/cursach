package ru.startem.aelevena.run

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.concurrent.ExecutorService
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadFactory
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Пулы исполнения. До этой правки был один маленький пул, в который синхронно блокировался
 * orchestrator через `.allOf(...).join()`, и при параллельных запусках наступал thread-pool
 * starvation deadlock (orchestrator-ы держали все слоты, ждали ноды; новым нодам слотов не было).
 *
 * Сейчас два разных пула + non-blocking orchestrator:
 *  - [workflowExecutor]   — лёгкая координация (setup графа, финализация runа). Маленький,
 *                            быстро освобождает поток, не блокируется на ноды.
 *  - [nodeExecutor]       — собственно работа нод: HTTP, Python sandbox, dataflow. Бо́льший,
 *                            может быть занят I/O (timeouts уже выставлены в исполнителях).
 *
 * Пулы ограничены сверху и имеют `CallerRunsPolicy` — под пиковой нагрузкой вызывающий поток
 * сам выполнит таску, а не получит `RejectedExecutionException` и run в навсегда-зависшем состоянии.
 */
@Configuration
class ExecutionConfig(
    @Value("\${app.execution.orchestrator-pool-size:0}") private val orchestratorPoolSize: Int = 0,
    @Value("\${app.execution.node-pool-min:0}") private val nodePoolMin: Int = 0,
    @Value("\${app.execution.node-pool-max:0}") private val nodePoolMax: Int = 0,
    @Value("\${app.execution.node-pool-queue:1000}") private val nodePoolQueue: Int = 1000,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Pool для оркестрации workflow-run-а. Использован для:
     *   - старта (чтение revision, topo-сорт, постановка нод),
     *   - финализации (mark finished, broadcast).
     * Не блокируется ожиданием нод (см. [WorkflowExecutionService]).
     */
    @Bean(destroyMethod = "shutdown")
    fun workflowExecutor(): ExecutorService {
        val cores = Runtime.getRuntime().availableProcessors()
        val size = if (orchestratorPoolSize > 0) orchestratorPoolSize else maxOf(4, cores)
        log.info("Initializing workflow orchestrator pool: size={}", size)
        return ThreadPoolExecutor(
            size,
            size,
            60L,
            TimeUnit.SECONDS,
            LinkedBlockingQueue(),
            namedFactory("workflow-exec-"),
            ThreadPoolExecutor.CallerRunsPolicy(),
        ).apply { allowCoreThreadTimeOut(false) }
    }

    /**
     * Pool для собственно исполнения нод. По умолчанию core = CPUs*2, max = CPUs*8 (минимум 16),
     * с большим bounded queue. CallerRunsPolicy не даёт runу зависнуть при переполнении.
     */
    @Bean(name = ["nodeExecutor"], destroyMethod = "shutdown")
    fun nodeExecutor(): ExecutorService {
        val cores = Runtime.getRuntime().availableProcessors()
        val coreSize = if (nodePoolMin > 0) nodePoolMin else maxOf(8, cores * 2)
        val maxSize = if (nodePoolMax > 0) nodePoolMax else maxOf(16, cores * 8)
        log.info(
            "Initializing node execution pool: core={}, max={}, queue={}",
            coreSize, maxSize, nodePoolQueue,
        )
        return ThreadPoolExecutor(
            coreSize,
            maxSize,
            60L,
            TimeUnit.SECONDS,
            LinkedBlockingQueue(nodePoolQueue),
            namedFactory("node-exec-"),
            ThreadPoolExecutor.CallerRunsPolicy(),
        ).apply { allowCoreThreadTimeOut(true) }
    }

    private fun namedFactory(prefix: String): ThreadFactory {
        val counter = AtomicInteger(0)
        return ThreadFactory { runnable ->
            Thread(runnable, "$prefix${counter.incrementAndGet()}").apply {
                isDaemon = false
                uncaughtExceptionHandler = Thread.UncaughtExceptionHandler { t, ex ->
                    log.error("Uncaught error in pool thread {}", t.name, ex)
                }
            }
        }
    }
}
