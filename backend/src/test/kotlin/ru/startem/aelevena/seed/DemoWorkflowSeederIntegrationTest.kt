package ru.startem.aelevena.seed

import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import ru.startem.aelevena.workflow.persistence.WorkflowsRepository
import java.time.Duration

/**
 * Прогон полноценного приложения с включённым demo-seeding. Сам факт того, что
 * ApplicationReadyEvent отстреливает и в БД появляется > 0 demo-workflow'ов, даёт
 * coverage для DemoWorkflowSeeder + всех 6 классов *Plan + PlanBuilders при реальном
 * исполнении (плюс репозиторий).
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = ["app.seed.demo-workflows-enabled=true"],
)
@Import(DemoWorkflowSeederIntegrationTest.ContainersConfig::class)
class DemoWorkflowSeederIntegrationTest {

    companion object {
        @Container
        val minio: GenericContainer<*> = GenericContainer("minio/minio:latest")
            .withEnv("MINIO_ROOT_USER", "minioadmin")
            .withEnv("MINIO_ROOT_PASSWORD", "minioadmin")
            .withCommand("server /data --console-address :9001")
            .withExposedPorts(9000)
            .withStartupTimeout(Duration.ofSeconds(60))

        @JvmStatic
        @DynamicPropertySource
        fun minioProperties(registry: DynamicPropertyRegistry) {
            minio.start()
            registry.add("app.s3.endpoint") { "http://localhost:${minio.getMappedPort(9000)}" }
            registry.add("app.s3.region") { "us-east-1" }
            registry.add("app.s3.bucket") { "a11a-blobs" }
            registry.add("app.s3.access-key") { "minioadmin" }
            registry.add("app.s3.secret-key") { "minioadmin" }
            registry.add("app.s3.path-style-access") { "true" }
        }
    }

    @Autowired private lateinit var workflowsRepository: WorkflowsRepository
    @Autowired private lateinit var seeder: DemoWorkflowSeeder
    @Autowired private lateinit var plans: List<DemoWorkflowPlan>

    @Test
    fun `seeder creates at least one demo workflow on first run`() {
        assertTrue(plans.isNotEmpty(), "DemoWorkflowPlan beans must be discovered")
        val list = workflowsRepository.list()
        assertTrue(list.any { it.isDemo }, "expected at least one demo workflow seeded")
    }

    @Test
    fun `running seeder a second time is idempotent (no duplicates)`() {
        val countBefore = workflowsRepository.list().count { it.isDemo }
        seeder.seed()
        val countAfter = workflowsRepository.list().count { it.isDemo }
        // Идемпотентность: повторный вызов seed() не должен плодить новые ноды.
        assertNotNull(countAfter)
        assertTrue(countAfter == countBefore, "demo count changed from $countBefore to $countAfter on re-seed")
    }

    @TestConfiguration
    class ContainersConfig {
        @Bean
        @ServiceConnection
        fun postgres(): PostgreSQLContainer<*> =
            PostgreSQLContainer("postgres:16-alpine")
                .withDatabaseName("a11a")
                .withUsername("a11a")
                .withPassword("a11a")
    }
}
