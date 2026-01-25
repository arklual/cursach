package ru.startem.aelevena.config

import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.servers.Server
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {
    @Bean
    fun openAPI(): OpenAPI {
        return OpenAPI()
            .info(
                Info()
                    .title("FlowForge Workflow BFF API")
                    .version("1.0.0")
                    .description("BFF API для управления workflow, их версиями, триггерами и запусками.")
            )
            .servers(
                listOf(
                    Server().url("/v1").description("Основной API сервер")
                )
            )
    }
}




