// Production env. На VPS фронт сидит за nginx на том же origin, который проксирует /v1 и /ws на backend:8080.
export const environment = {
    production: true,
    apiBaseUrl: '/v1',
    wsUrl: '/ws',
};
