package ru.startem.aelevena.ws

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.messaging.simp.config.MessageBrokerRegistry
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker
import org.springframework.web.socket.config.annotation.StompEndpointRegistry
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer

@Configuration
@EnableWebSocketMessageBroker
class WebSocketConfig(
    @Value("\${app.ws.allowed-origins:http://localhost:4200}")
    private val allowedOriginsCsv: String,
) : WebSocketMessageBrokerConfigurer {
    override fun configureMessageBroker(registry: MessageBrokerRegistry) {
        registry.setApplicationDestinationPrefixes("/app")
        registry.enableSimpleBroker("/topic", "/queue")
    }

    override fun registerStompEndpoints(registry: StompEndpointRegistry) {
        val patterns = allowedOriginsCsv
            .split(',')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toTypedArray()
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns(*patterns)
            .withSockJS()
    }
}

