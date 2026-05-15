// Development env (ng serve). Бэк локально — http://localhost:8080/v1.
// WS-endpoint живёт ВНУТРИ context-path /v1 (Spring оборачивает StompEndpointRegistry).
export const environment = {
    production: false,
    apiBaseUrl: 'http://localhost:8080/v1',
    wsUrl: 'http://localhost:8080/v1/ws',
};
