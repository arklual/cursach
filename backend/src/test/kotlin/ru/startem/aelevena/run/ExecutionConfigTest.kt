package ru.startem.aelevena.run

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
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
    fun `nodeExecutor is a separate pool with own thread prefix`() {
        val cfg = ExecutionConfig()
        val node = cfg.nodeExecutor()
        val orch = cfg.workflowExecutor()
        try {
            assertNotSame(node, orch, "node and orchestrator pools must be distinct")
            val name = node.submit<String> { Thread.currentThread().name }.get(2, TimeUnit.SECONDS)
            assertTrue(name.startsWith("node-exec-"), "name=$name")
            val tpe = node as ThreadPoolExecutor
            assertTrue(tpe.maximumPoolSize >= 16, "node pool max should be >= 16, was ${tpe.maximumPoolSize}")
        } finally {
            node.shutdownNow()
            orch.shutdownNow()
        }
    }

    @Test
    fun `uncaught exception handler logs without crashing the pool`() {
        val cfg = ExecutionConfig()
        val executor = cfg.workflowExecutor()
        try {
            val future = executor.submit { throw RuntimeException("inside-task") }
            try {
                future.get(1, TimeUnit.SECONDS)
            } catch (_: Exception) {
            }
            val pong = executor.submit<String> { "pong" }.get(1, TimeUnit.SECONDS)
            assertEquals("pong", pong)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `orchestrator pool does not deadlock when many tasks await nodeExecutor`() {
        val cfg = ExecutionConfig(orchestratorPoolSize = 2)
        val orch = cfg.workflowExecutor()
        val node = cfg.nodeExecutor()
        try {
            val runs = 20
            val nodeStarted = CountDownLatch(runs)
            val allDone = CountDownLatch(runs)
            repeat(runs) {
                orch.submit {
                    val f = java.util.concurrent.CompletableFuture.supplyAsync({
                        nodeStarted.countDown()
                        Thread.sleep(120)
                        "ok"
                    }, node)
                    f.whenCompleteAsync({ _, _ -> allDone.countDown() }, orch)
                }
            }
            assertTrue(
                nodeStarted.await(10, TimeUnit.SECONDS),
                "node-exec pool stalled: started=${runs - nodeStarted.count}/$runs",
            )
            assertTrue(
                allDone.await(10, TimeUnit.SECONDS),
                "finalize stalled: done=${runs - allDone.count}/$runs",
            )
        } finally {
            orch.shutdownNow()
            node.shutdownNow()
        }
    }
}
