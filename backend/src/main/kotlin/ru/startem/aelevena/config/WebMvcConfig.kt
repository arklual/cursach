package ru.startem.aelevena.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

// CORS-конфиг для разработки. Без него фронт на localhost:4200 не сможет вызвать API.
// В prod фронт за nginx проксирует /v1 на бэк (один origin), но конфиг безопасен везде.
@Configuration
class WebMvcConfig(
    @Value("\${app.cors.allowed-origins:http://localhost:4200,http://localhost}")
    private val allowedOrigins: String,
) : WebMvcConfigurer {

    override fun addCorsMappings(registry: CorsRegistry) {
        val origins = allowedOrigins.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toTypedArray()
        registry.addMapping("/**")
            .allowedOrigins(*origins)
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .exposedHeaders("Location")
            .allowCredentials(false)
            .maxAge(3600)
    }
}
