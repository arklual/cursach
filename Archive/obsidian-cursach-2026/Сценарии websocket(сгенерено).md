# WebSocket Contracts — FluxPilot Workflow Editor  
  
## Подключение  
  
```  
ws://localhost:8080/ws/workflow/{workflowId}  
wss://api.fluxpilot.io/ws/workflow/{workflowId}  
```  
  
При подключении клиент получает полное состояние workflow.  
  
---  
  
## Формат сообщений  
  
Все сообщения в формате JSON:  
  
```typescript  
interface WsMessage {  type: string;        // Тип сообщения  
  payload: any;        // Данные  
  requestId?: string;  // ID запроса (для ответов)  
  timestamp?: string;  // ISO timestamp  
}  
```  
  
---  
  
## Client → Server (Исходящие сообщения)  
  
### 1. Загрузка workflow  
  
При подключении сервер автоматически отправляет состояние. Но можно запросить вручную:  
  
```json  
{  
  "type": "workflow:load",  
  "requestId": "req_001"  
}  
```  
  
---  
  
### 2. Управление нодами  
  
#### Добавить ноду  
```json  
{  
  "type": "node:add",  
  "requestId": "req_002",  
  "payload": {  
    "kind": "http",  
    "position": { "x": 200, "y": 150 },  
    "label": "HTTP Request",  
    "successProb": 0.35  
  }}  
```  
  
#### Обновить позицию ноды  
```json  
{  
  "type": "node:move",  
  "requestId": "req_003",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "position": { "x": 300, "y": 200 }  
  }}  
```  
  
#### Обновить данные ноды  
```json  
{  
  "type": "node:update",  
  "requestId": "req_004",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "data": {  
      "label": "Updated Label",  
      "successProb": 0.5,  
      "variants": [  
        { "label": "A", "weight": 0.5 },  
        { "label": "B", "weight": 0.5 }  
      ],      "randomization": "hashed"  
    }  }}  
```  
  
#### Удалить ноду  
```json  
{  
  "type": "node:remove",  
  "requestId": "req_005",  
  "payload": {  
    "nodeId": "node_xyz789"  
  }}  
```  
  
#### Выбрать ноду (активировать)  
```json  
{  
  "type": "node:select",  
  "payload": {  
    "nodeId": "node_xyz789"  
  }}  
```  
  
---  
  
### 3. Управление связями (edges)  
  
#### Добавить связь  
```json  
{  
  "type": "edge:add",  
  "requestId": "req_006",  
  "payload": {  
    "source": "node_abc",  
    "target": "node_xyz",  
    "label": "A",  
    "variant": "A"  
  }}  
```  
  
#### Удалить связь  
```json  
{  
  "type": "edge:remove",  
  "requestId": "req_007",  
  "payload": {  
    "edgeId": "edge_abc123"  
  }}  
```  
  
---  
  
### 4. Метаданные workflow  
  
#### Обновить метаданные  
```json  
{  
  "type": "workflow:update-meta",  
  "requestId": "req_008",  
  "payload": {  
    "name": "New Workflow Name",  
    "description": "Updated description",  
    "status": "running"  
  }}  
```  
  
---  
  
### 5. Симуляция  
  
#### Запустить симуляцию  
```json  
{  
  "type": "simulation:run",  
  "requestId": "req_009",  
  "payload": {  
    "count": 500,  
    "mode": "bulk"  
  }}  
```  
  
**mode:**  
- `bulk` — массовая симуляция N пользователей  
- `sample` — один тестовый запуск  
- `replay` — воспроизведение сохраненных событий  
  
#### Тестировать одну ноду  
```json  
{  
  "type": "node:test",  
  "requestId": "req_010",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "testPayload": {  
      "plan": "pro",  
      "device": "ios"  
    }  }}  
```  
  
---  
  
### 6. Эксперимент  
  
#### Обновить конфигурацию эксперимента  
```json  
{  
  "type": "experiment:config",  
  "requestId": "req_011",  
  "payload": {  
    "primaryMetric": "conversion_rate",  
    "secondaryMetrics": "revenue,engagement",  
    "period": 14,  
    "minSample": 1000,  
    "alpha": 0.05,  
    "power": 0.8,  
    "variants": [  
      { "label": "A", "weight": 0.5 },  
      { "label": "B", "weight": 0.5 }  
    ],    "randomization": "hashed",  
    "seed": "exp_seed_123"  
  }}  
```  
  
#### Запустить эксперимент  
```json  
{  
  "type": "experiment:start",  
  "requestId": "req_012"  
}  
```  
  
#### Получить результаты эксперимента  
```json  
{  
  "type": "experiment:results",  
  "requestId": "req_013"  
}  
```  
  
---  
  
### 7. Аналитика  
  
#### Запросить аналитику по ноде  
```json  
{  
  "type": "analytics:node",  
  "requestId": "req_014",  
  "payload": {  
    "nodeId": "node_xyz789"  
  }}  
```  
  
#### Экспорт событий ноды  
```json  
{  
  "type": "analytics:export",  
  "requestId": "req_015",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "limit": 100  
  }}  
```  
  
---  
  
### 8. Логи  
  
#### Очистить логи  
```json  
{  
  "type": "logs:clear"  
}  
```  
  
---  
  
## Server → Client (Входящие сообщения)  
  
### 1. Полное состояние workflow  
  
Отправляется при подключении и по запросу `workflow:load`:  
  
```json  
{  
  "type": "workflow:state",  
  "requestId": "req_001",  
  "payload": {  
    "meta": {  
      "id": "wf_abc123",  
      "name": "Checkout A/B Test",  
      "description": "Testing new checkout flow",  
      "status": "draft",  
      "nodesCount": 5,  
      "createdAt": "2025-01-15T10:00:00Z",  
      "updatedAt": "2025-01-20T15:30:00Z"  
    },    "nodes": [  
      {        "id": "node_001",  
        "type": "workflowNode",  
        "position": { "x": 100, "y": 100 },  
        "data": {  
          "id": "node_001",  
          "kind": "trigger",  
          "label": "Trigger",  
          "color": "#38bdf8",  
          "successProb": 0.2,  
          "variants": [],  
          "randomization": "simple",  
          "metrics": {  
            "reached": 0,  
            "converted": 0,  
            "pHat": 0,  
            "variance": 0,  
            "ci": [0, 0],  
            "users": [],  
            "events": []  
          }        }      }    ],    "edges": [  
      {        "id": "edge_001",  
        "source": "node_001",  
        "target": "node_002",  
        "label": null,  
        "data": {}  
      }    ],    "experimentConfig": {  
      "primaryMetric": "conversion_rate",  
      "secondaryMetrics": "",  
      "period": 14,  
      "minSample": 1000,  
      "alpha": 0.05,  
      "power": 0.8,  
      "variants": [  
        { "label": "A", "weight": 0.5 },  
        { "label": "B", "weight": 0.5 }  
      ],      "randomization": "simple",  
      "seed": ""  
    }  }}  
```  
  
---  
  
### 2. Подтверждения операций  
  
#### Нода добавлена  
```json  
{  
  "type": "node:added",  
  "requestId": "req_002",  
  "payload": {  
    "node": {  
      "id": "node_new123",  
      "type": "workflowNode",  
      "position": { "x": 200, "y": 150 },  
      "data": { ... }    }  }}  
```  
  
#### Нода обновлена  
```json  
{  
  "type": "node:updated",  
  "requestId": "req_004",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "data": { ... }  }}  
```  
  
#### Нода удалена  
```json  
{  
  "type": "node:removed",  
  "requestId": "req_005",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "removedEdges": ["edge_001", "edge_002"]  
  }}  
```  
  
#### Связь добавлена  
```json  
{  
  "type": "edge:added",  
  "requestId": "req_006",  
  "payload": {  
    "edge": {  
      "id": "edge_new456",  
      "source": "node_abc",  
      "target": "node_xyz",  
      "label": "A",  
      "data": { "variant": "A" }  
    }  }}  
```  
  
#### Связь удалена  
```json  
{  
  "type": "edge:removed",  
  "requestId": "req_007",  
  "payload": {  
    "edgeId": "edge_abc123"  
  }}  
```  
  
---  
  
### 3. Метрики (realtime updates)  
  
#### Обновление метрик ноды  
Отправляется во время симуляции для каждой ноды:  
  
```json  
{  
  "type": "metrics:update",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "metrics": {  
      "reached": 150,  
      "converted": 52,  
      "pHat": 0.347,  
      "variance": 0.00151,  
      "ci": [0.285, 0.409],  
      "users": [  
        {          "id": "usr_120394",  
          "variant": "A",  
          "timestamp": "2025-01-20T15:30:00Z",  
          "payload": {  
            "device": "ios",  
            "country": "DE",  
            "cohort": "2024-W1",  
            "plan": "pro",  
            "amount": 99  
          }        }      ],      "events": [  
        {          "id": "evt_001",  
          "nodeId": "node_xyz789",  
          "userId": "usr_120394",  
          "variant": "A",  
          "timestamp": "2025-01-20T15:30:00Z",  
          "latencyMs": 84,  
          "success": true  
        }      ]    }  }}  
```  
  
---  
  
### 4. Результаты симуляции  
  
```json  
{  
  "type": "simulation:result",  
  "requestId": "req_009",  
  "payload": {  
    "runId": "run_abc123",  
    "mode": "bulk",  
    "usersSimulated": 500,  
    "durationMs": 1250,  
    "nodeMetrics": [  
      {        "nodeId": "node_001",  
        "reached": 500,  
        "converted": 175,  
        "pHat": 0.35  
      },      {        "nodeId": "node_002",  
        "reached": 250,  
        "converted": 88,  
        "pHat": 0.352  
      }    ]  }}  
```  
  
---  
  
### 5. Результаты эксперимента  
  
```json  
{  
  "type": "experiment:results",  
  "requestId": "req_013",  
  "payload": {  
    "workflowId": "wf_abc123",  
    "status": "running",  
    "startedAt": "2025-01-15T10:00:00Z",  
    "variants": [  
      {        "label": "A",  
        "weight": 0.5,  
        "reached": 2500,  
        "converted": 875,  
        "pHat": 0.35,  
        "ci": [0.331, 0.369]  
      },      {        "label": "B",  
        "weight": 0.5,  
        "reached": 2500,  
        "converted": 750,  
        "pHat": 0.30,  
        "ci": [0.282, 0.318]  
      }    ],    "comparison": {  
      "delta": 0.05,  
      "pooledStdErr": 0.013,  
      "ci": [0.025, 0.075],  
      "pValue": 0.0012,  
      "significant": true  
    },    "recommendation": "rollout_a",  
    "segmentation": {  
      "byDevice": {  
        "ios": {  
          "variantA": { "n": 800, "pHat": 0.38 },  
          "variantB": { "n": 750, "pHat": 0.32 },  
          "delta": 0.06,  
          "pValue": 0.02  
        },        "android": {  
          "variantA": { "n": 900, "pHat": 0.33 },  
          "variantB": { "n": 950, "pHat": 0.29 },  
          "delta": 0.04,  
          "pValue": 0.08  
        }      },      "byCountry": {  
        "DE": { ... },        "BR": { ... }      }    }  }}  
```  
  
---  
  
### 6. Детальная аналитика ноды  
  
```json  
{  
  "type": "analytics:node",  
  "requestId": "req_014",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "metrics": {  
      "reached": 1500,  
      "converted": 525,  
      "pHat": 0.35,  
      "variance": 0.000152,  
      "ci": [0.326, 0.374],  
      "users": [ ... ],  
      "events": [ ... ]  
    },    "funnel": {  
      "reached": 1500,  
      "converted": 525,  
      "dropoff": 0.65  
    },    "conversionOverTime": [  
      { "timestamp": "2025-01-15T10:00:00Z", "cumulative_n": 100, "cumulative_pHat": 0.32 },  
      { "timestamp": "2025-01-15T11:00:00Z", "cumulative_n": 250, "cumulative_pHat": 0.34 },  
      { "timestamp": "2025-01-15T12:00:00Z", "cumulative_n": 500, "cumulative_pHat": 0.35 }  
    ],    "latencyDistribution": {  
      "buckets": [  
        { "range": "0-50ms", "count": 450 },  
        { "range": "50-100ms", "count": 680 },  
        { "range": "100-150ms", "count": 280 },  
        { "range": "150+ms", "count": 90 }  
      ],      "p50": 62,  
      "p95": 142,  
      "p99": 189  
    }  }}  
```  
  
---  
  
### 7. Экспорт событий  
  
```json  
{  
  "type": "analytics:export",  
  "requestId": "req_015",  
  "payload": {  
    "nodeId": "node_xyz789",  
    "events": [  
      {        "event": "node_reached",  
        "workflow_id": "wf_abc123",  
        "run_id": "run_001",  
        "node_id": "node_xyz789",  
        "variant": "A",  
        "user_id_hash": "usr_120394",  
        "timestamp": "2025-01-20T15:30:00Z",  
        "payload_summary": { "plan": "pro", "device": "ios" },  
        "path": ["node_001", "node_xyz789"],  
        "session_id": "sess_120394"  
      }    ]  }}  
```  
  
---  
  
### 8. Логи  
  
#### Новая запись в лог  
```json  
{  
  "type": "log:entry",  
  "payload": {  
    "message": "[15:30:00] User usr_120394 reached node_xyz789",  
    "timestamp": "2025-01-20T15:30:00Z",  
    "level": "info"  
  }}  
```  
  
**level:** `info`, `warn`, `error`, `debug`  
  
---  
  
### 9. Ошибки  
  
```json  
{  
  "type": "error",  
  "requestId": "req_004",  
  "payload": {  
    "code": "NODE_NOT_FOUND",  
    "message": "Node with id 'node_xyz789' not found"  
  }}  
```  
  
**Коды ошибок:**  
- `NODE_NOT_FOUND` — нода не найдена  
- `EDGE_NOT_FOUND` — связь не найдена  
- `WORKFLOW_NOT_FOUND` — workflow не найден  
- `INVALID_PAYLOAD` — некорректные данные  
- `VALIDATION_ERROR` — ошибка валидации  
- `INTERNAL_ERROR` — внутренняя ошибка сервера  
  
---  
  
## Типы данных  
  
### NodeKind  
```typescript  
type NodeKind = 'trigger' | 'http' | 'dataflow' | 'code' | 'ab' | 'join';```  
  
### WorkflowStatus  
```typescript  
type WorkflowStatus = 'draft' | 'running' | 'paused' | 'completed';```  
  
### RandomizationMode  
```typescript  
type RandomizationMode = 'simple' | 'hashed' | 'stratified';```  
  
### Position  
```typescript  
interface Position {  x: number;  
  y: number;  
}  
```  
  
### Variant  
```typescript  
interface Variant {  label: string;   // "A", "B", "C"  
  weight: number;  // 0.0 - 1.0  
}  
```  
  
### NodeMetrics  
```typescript  
interface NodeMetrics {  reached: number;  
  converted: number;  
  pHat: number;           // p̂ = converted/reached  
  variance: number;  
  ci: [number, number];   // 95% CI  
  users: UserEntry[];     // last 20  
  events: EventEntry[];   // last 200  
}  
```  
  
### UserEntry  
```typescript  
interface UserEntry {  id: string;  
  variant: string | null;  
  timestamp: string;  
  payload: {  
    device: 'ios' | 'android' | 'web';  
    country: string;  
    cohort: string;  
    plan: 'free' | 'pro' | 'team';  
    amount: number;  
  };}  
```  
  
### EventEntry  
```typescript  
interface EventEntry {  id: string;  
  nodeId: string;  
  userId: string;  
  variant: string | null;  
  timestamp: string;  
  latencyMs: number;  
  success: boolean;  
}  
```  
  
---  
  
## Пример сессии  
  
```  
1. Client connects to ws://localhost:8080/ws/workflow/wf_abc123  
  
2. Server → Client: workflow:state (полное состояние)  
  
3. Client → Server: node:add (добавляем HTTP ноду)  
4. Server → Client: node:added (подтверждение)  
  
5. Client → Server: edge:add (создаем связь)  
6. Server → Client: edge:added (подтверждение)  
  
7. Client → Server: simulation:run { count: 500, mode: "bulk" }  
8. Server → Client: metrics:update (много раз, по мере симуляции)  
9. Server → Client: log:entry (много раз)  
10. Server → Client: simulation:result (финальный результат)  
  
11. Client → Server: experiment:results  
12. Server → Client: experiment:results (статистика A/B теста)  
```  
  
---  
  
## Heartbeat / Keep-alive  
  
Клиент должен отправлять ping каждые 30 секунд:  
  
```json  
{ "type": "ping" }  
```  
  
Сервер отвечает:  
  
```json  
{ "type": "pong" }  
```  
  
Если нет pong в течение 10 секунд — переподключение.