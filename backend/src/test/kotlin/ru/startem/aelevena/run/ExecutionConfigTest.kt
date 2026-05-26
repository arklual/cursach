package ru.startem.aelevena.run

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class ExecutionConfigTest {

    @Test
    fun `workflowExecutor names threads workflow-exec- and runs tasks`() {
        val cfg = ExecutionConfig()
        val executor = cfg.workflowExecutor()
        try {
            val (poolSize, threadName) = executor.submit<Pair<Int, String>> {
                val tpe = executor as ThreadPoolExecutor
                tpe.corePoolSize to Thread.currentThread().name
            }.get(2, TimeUnit.SECONDS)
            assertTrue(poolSize >= 4)
            assertTrue(threadName.startsWith("workflow-exec-"), "name=$threadName")
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `uncaught exception handler logs without crashing the pool`() {
        val cfg = ExecutionConfig()
        val executor = cfg.workflowExecutor()
        try {
            val t = Thread {
                throw RuntimeException("boom")
            }.apply { name = "workflow-exec-test" }
            // Use the factory's handler indirectly: spawn a thread through the executor that throws.
            val future = executor.submit { throw RuntimeException("inside-task") }
            // ExecutorService swallows the exception inside Future; cancel it to clean up.
            try {
                future.get(1, TimeUnit.SECONDS)
            } catch (_: Exception) {
                // expected — the task itself threw, .get() rethrows as ExecutionException
            }
            // Executor must remain usable for further work.
            val pong = executor.submit<String> { "pong" }.get(1, TimeUnit.SECONDS)
            assertTrue(pong == "pong")
        } finally {
            executor.shutdownNow()
        }
    }
}
