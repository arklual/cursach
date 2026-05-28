[[C4 Diagram]]

Начнём как с маленького RFC, в который встроены C4-диаграммы (словами), чтобы тебе потом было удобно это перенести в docs/Notion/PlantUML.

---
### 0. Краткое описание

Система позволяет продуктовой команде (PM/аналитикам) визуально собирать workflow (граф из нод), запускать его по триггерам (ручной, scheduler, webhook) и получать полностью детерминированный стейт исполнения для анализа экспериментов и A/B тестов.

MVP фокус:

1. Редактор workflow (граф).
    
2. Триггеры (ручной, расписание, webhook).
    
3. HTTP-нода.
    
4. Полный просмотр стейта выполнения.
    
5. Потоки данных (filter / map / reduce / foreach / flatMap).
    
6. Code Node (Python, sandbox).
    
7. Параллельное исполнение веток графа.
    

ЦА: продуктовые команды, которые хотят быстро запускать эксперименты без привлечения разработчиков.

---

## 1. Требования

### 1.1. Функциональные (из твоего ТЗ, немного структурирую)

**Работа с workflow**

- Создать/редактировать/удалить workflow.
    
- Добавлять/удалять ноды на canvas.
    
- Соединять/удалять рёбра.
    
- Редактировать параметры ноды:
    
    - HTTP-нода: method, URL, headers, body, timeout.
        
    - Code Node: Python-код, доступ к данным прошлых нод.
        
    - Data-flow ноды: конфигурация (поле для filter/map, выражение и т.п.).
        
- Перемещать ноды по canvas.
    
- Сохранять workflow (с версионированием).
    

**Триггеры workflow**

- Ручной запуск:
    
    - Кнопка “Run” в UI.
        
    - Ввод входных параметров.
        
- Scheduler:
    
    - Интервалы: каждые N секунд/минут/часов.
        
    - “Будильник” по cron-паттернам (раз в день/неделю и т.п.).
        
- Webhook:
    
    - Автоматическая генерация unique URL.
        
    - Приём POST JSON.
        
    - Маппинг JSON в входные данные workflow.
        

**Ноды**

- HTTP Node:
    
    - Методы: GET, POST, PUT, DELETE.
        
    - URL, headers (key/value), body.
        
    - Timeout.
        
    - Результат: HTTP status, body, ошибки.
        
- Data-flow ноды:
    
    - filter, map, reduce, foreach, flatMap над коллекцией (например, JSON-массив).
        
- Code Node (Python):
    
    - Редактор кода.
        
    - Доступ к входу и результатам предыдущих нод (context).
        
    - Sandbox: ограничения по CPU/времени/памяти, нет доступа к диску/сети (кроме разрешённого).
        
- Параллельное исполнение:
    
    - Если от ноды идут несколько исходящих рёбер — ветки выполняются параллельно.
        
    - Синхронизация: ноды, зависящие от нескольких родителей, стартуют после готовности всех родителей.
        

**Стейт и наблюдаемость**

- Для каждого запуска (run) видеть:
    
    - Список узлов, которые выполнялись.
        
    - Входные данные ноды.
        
    - Выходные данные ноды.
        
    - Ошибки.
        
    - Время начала/окончания, длительность.
        
- Журнал запусков workflow.
    

---

### 1.2. Нефункциональные

MVP-гипотеза: один продукт / одна команда, но проектируем с прицелом на SaaS.

- **RPS / нагрузка**
    
    - MVP-цель:
        
        - до 50 RPS по webhook/trigger API,
            
        - до 20 одновременных активных workflow-запусков,
            
        - до 200 нод в одном workflow.
            
    - Целевая архитектура: масштабируемость до 500–1000 RPS за счёт горизонтального масштабирования воркеров и API.
        
- **Latency**
    
    - P95 latency запуска webhook-триггера → постановка в очередь: < 150ms.
        
    - P95 исполнения простой цепочки из 3 HTTP-нод: < 1s (без учёта внешних систем).
        
- **Availability**
    
    - MVP: 99.5% (≈ ~3.5 дня даунтайма в год, ок для early adopters).
        
    - Цель продукта: 99.9%+ (HA, репликация БД, rolling deployments).
        
- **Consistency**
    
    - Strong consistency для стейта workflow-run и node-run (одна БД – Postgres).
        
- **Durability**
    
    - Стейт запусков хранится ≥ 90 дней (конфигурируемо).
        
- **Безопасность**
    
    - AuthN/AuthZ: хотя бы Single-tenant со стандартной auth (JWT / OIDC).
        
    - Python-sandbox изолирован по сети/ресурсам, наличие таймаутов.
        
- **Масштабируемость**
    
    - Горизонтальное масштабирование:
        
        - API-шлюз/Backend.
            
        - Worker-нод (экзекьютор графа).
            
    - Возможность сменить реализацию очереди (DB → Kafka/RabbitMQ) без изменения доменной логики.
        

---

## 2. Границы системы (C4: System Context)

**System:** `Experiment Workflow Engine`

### Основные акторы

- **Product Manager / Аналитик (Web UI User)**
    
    - Создаёт и редактирует workflow.
        
    - Запускает workflow вручную.
        
    - Смотрит результаты, стейт, метрики.
        
- **Product Backend / External Systems**
    
    - Отправляет события на webhook-триггеры (user signup, click, purchase).
        
    - Может вызывать вручную REST API для запуска workflow.
        
- **Внешние сервисы (через HTTP Node)**
    
    - Google Sheets, Google Analytics, Яндекс.Метрика, CRM, internal API продукта и т.п.
        
    - Система — только клиент к ним.
        
- **Identity Provider (OIDC/Auth provider)**
    
    - Авторизация пользователя фронта.
        

### System Context (словами)

- Пользователь через браузер → `Web App` (SPA).
    
- Web App → `Backend API` (REST).
    
- Backend API:
    
    - общается с `Orchestrator/Runner` (логически отдельный компонент, но может быть в том же сервисе),
        
    - пишет/читает стейт в `PostgreSQL`,
        
    - использует `Message Queue` для постановки задач нод.
        
- `Worker Nodes` читают задачи из `Message Queue`, выполняют HTTP/Code/Data-flow ноды, пишут результаты в `PostgreSQL`.
    
- `Python Sandbox Service` запускает пользовательский код в безопасной среде и общается только с Worker-нодами.
    
- Вебхук-запросы от внешних систем попадают в `Backend API` по публичному URL, который маппится на нужный workflow/trigger.
    

---

## 3. C4: Container Diagram (уровень контейнеров)

### Контейнеры

1. **Web App (Frontend)**
    
    - Тип: SPA.
        
    - Технологии: React + TypeScript (+ React Flow или аналог для canvas).
        
    - Ответственность:
        
        - Редактор workflow (ноды/рёбра, параметры, drag&drop).
            
        - UI триггеров (scheduler, webhook).
            
        - UI стейта и логов.
            
        - Авторизация (OIDC / OAuth2, хранение токена).
            
2. **API & Control Plane (Backend API)**
    
    - Тип: Java сервис, `Spring Boot` (или Micronaut/Quarkus).
        
    - Ответственность:
        
        - REST API для UI и внешних клиентов.
            
        - Управление сущностями: Workflow, Nodes, Edges, Triggers, Runs.
            
        - CRUD для workflow и версионирования.
            
        - Генерация и валидация webhook URL.
            
        - AuthN/AuthZ.
            
        - Постановка запусков workflow в очередь.
            
        - Агрегация стейта для UI (node runs, logs, ошибки).
            
3. **Orchestrator / Scheduler (можно как отдельный модуль в том же сервисе)**
    
    - Тип: Java-модуль или отдельный сервис.
        
    - Ответственность:
        
        - Планирование выполнения workflow-графа (топологический порядок).
            
        - Определение параллельных нод и постановка задач для них.
            
        - Обработка завершения node-run: планирование следующих нод.
            
        - Обработка ретраев, таймаутов.
            
        - Scheduler-триггеры (cron/interval): проверка расписаний и запуск workflow.
            
4. **Worker Service**
    
    - Тип: Java сервис (отдельный деплой за масштабируемость).
        
    - Ответственность:
        
        - Получение задач на выполнение ноды (из MQ).
            
        - Исполнение:
            
            - HTTP Node (через HTTP-клиент).
                
            - Data-flow ноды (filter/map/...).
                
            - Code Node: обращается к Python Sandbox Service.
                
        - Запись результата node-run в DB.
            
    - Worker-ы масштабируются горизонтально.
        
5. **Python Sandbox Service**
    
    - Тип: Python-сервис.
        
    - Ответственность:
        
        - Принимает “код + входные данные” от Worker-ов.
            
        - Запускает код в изолированной среде (например, контейнер с ограничением по CPU/памяти/времени).
            
        - Возвращает результат или ошибку.
            
    - Без доступа к внешней сети (кроме, возможно, whitelisted).
        
6. **Message Queue**
    
    - MVP: можно начать с DB-очереди или Redis Streams.
        
    - Цель: абстракция `Job Queue` (интерфейс + адаптеры).
        
    - Ответственность:
        
        - Хранение задач node-run в состоянии QUEUED.
            
        - Доставка задач воркерам.
            
        - Поддержка ack/ retry.
            
7. **PostgreSQL (Primary DB)**
    
    - Ответственность:
        
        - Хранение: Workflow, Nodes, Edges, Triggers.
            
        - Версии workflow.
            
        - WorkflowRun, NodeRun, Logs.
            
        - Пользователи/проекты (tenants).
            
    - Позже: возможно шардирование / репликация.
        
8. **Redis (опционально)**
    
    - Кэширование:
        
        - описание workflow по id версии, чтобы не ходить каждый раз в Postgres.
            
    - Rate limiting для webhooks и API.
        
9. **Monitoring/Logging**
    
    - Prometheus + Grafana (метрики).
        
    - Loki/ELK (логи).
        
    - Не критично для MVP, но лучше сразу заложить.
        

---

## 4. Основные sequence-диаграммы (текстом)

### 4.1. Manual Run

1. User → Web App: нажимает “Run workflow” + вводит параметры.
    
2. Web App → API: `POST /workflows/{id}/runs` (body: inputParams, versionId?).
    
3. API:
    
    - создаёт `WorkflowRun` (status=QUEUED).
        
    - кладёт в `JobQueue` событие типа `StartWorkflowRun(workflowRunId)`.
        
4. Orchestrator (consumer `JobQueue`):
    
    - грузит структуру workflow (nodes/edges, версию) из Postgres/кэша.
        
    - определяет стартовые ноды (без входящих рёбер или специальные trigger-ноды).
        
    - для каждой стартовой ноды:
        
        - создаёт `NodeRun` (QUEUED).
            
        - кладёт в `JobQueue` задачу `ExecuteNode(nodeRunId)`.
            
5. Worker:
    
    - забирает `ExecuteNode`.
        
    - читает `NodeRun`, `WorkflowRun`, получает входные данные (inputParams + outputs родителей).
        
    - исполняет ноду (HTTP/Data-flow/Python).
        
    - пишет результат `NodeRun` (status=SUCCESS/FAILED, output, error, timings).
        
6. Orchestrator:
    
    - по событию завершения NodeRun (через JobQueue или polling DB) определяет, какие child-ноды теперь могут стартовать, и повторяет шаг 4.
        
7. Web App:
    
    - через polling или WebSocket/SSE запрашивает `GET /workflow-runs/{id}` + `GET /node-runs?workflowRunId=...`
        
    - показывает прогресс, стейт, логи.
        

### 4.2. Webhook Trigger

1. External System → API: `POST /webhook/{token}`.
    
2. API:
    
    - валидирует token → находит `Trigger` → `Workflow`.
        
    - создаёт `WorkflowRun` (source=WEBHOOK, input=body).
        
    - кладёт `StartWorkflowRun` в `JobQueue`.
        
3. Дальше как в Manual Run.
    

### 4.3. Scheduler Trigger

1. Scheduler (часть Orchestrator) по таймеру:
    
    - сканирует `Trigger` с типом SCHEDULED.
        
    - для due-триггеров создаёт `WorkflowRun` и добавляет `StartWorkflowRun` в очередь.
        

---

## 5. API дизайн (черновик)

REST, JSON. Названия можно потом перепилить.

### 5.1. Workflow Management

- `POST /projects/{projectId}/workflows`
    
    - Создать workflow (draft).
        
- `GET /workflows/{workflowId}`
    
- `PATCH /workflows/{workflowId}`
    
- `DELETE /workflows/{workflowId}`
    
- `POST /workflows/{workflowId}/versions`
    
    - Зафиксировать новую версию (snapshot текущего графа).
        
- `GET /workflows/{workflowId}/versions`
    
- `GET /workflow-versions/{versionId}`
    

### 5.2. Nodes & Edges (можно инлайн в версию, но для гибкости — отдельные ресурсы)

- `PUT /workflow-versions/{versionId}/graph`
    
    - Сохранить весь граф: список нод и рёбер.
        
    - Payload:
        
        - nodes: [{id, type, configJson, position}]
            
        - edges: [{id, fromNodeId, toNodeId, condition?}]
            

### 5.3. Triggers

- `POST /workflows/{workflowId}/triggers`
    
    - type: MANUAL / SCHEDULE / WEBHOOK
        
    - config:
        
        - SCHEDULE: cron/interval.
            
        - WEBHOOK: auto-generated token (server-side).
            
- `GET /workflows/{workflowId}/triggers`
    
- `DELETE /triggers/{triggerId}`
    

**Webhook endpoint**

- `POST /webhook/{token}` (public, без auth, но длинный токен + rate limit).
    

### 5.4. Runs & State

- `POST /workflows/{workflowId}/runs`
    
    - body: { versionId?, input: JSON }
        
- `GET /workflows/{workflowId}/runs?limit=&status=`
    
- `GET /workflow-runs/{runId}`
    
    - summary по запуску.
        
- `GET /workflow-runs/{runId}/nodes`
    
    - список node-run.
        
- `GET /node-runs/{nodeRunId}`
    
    - полные вход/выход/ошибки.
        

---

## 6. Data Model (основные сущности)

Реляционная модель (PostgreSQL).

### 6.1. Core

**project**

- id
    
- name
    
- created_at
    

**workflow**

- id
    
- project_id (FK → project)
    
- name
    
- description
    
- created_by
    
- created_at
    
- updated_at
    
- is_deleted
    

**workflow_version**

- id
    
- workflow_id
    
- version_number (int, auto-increment per workflow)
    
- status (DRAFT / ACTIVE / ARCHIVED)
    
- created_at
    
- created_by
    

**node**

- id
    
- workflow_version_id
    
- type (HTTP, CODE_PYTHON, FILTER, MAP, REDUCE, FOREACH, FLATMAP, …)
    
- name
    
- config_json (параметры ноды: url, method, script и т.п.)
    
- position_x, position_y
    
- created_at
    

**edge**

- id
    
- workflow_version_id
    
- from_node_id
    
- to_node_id
    
- condition_json (опционально, для future if/branches)
    
- created_at
    

### 6.2. Triggers & Runs

**trigger**

- id
    
- workflow_id
    
- type (MANUAL, SCHEDULE, WEBHOOK)
    
- config_json (cron, interval, allowed IPs, etc.)
    
- webhook_token (nullable, только для WEBHOOK)
    
- enabled (bool)
    
- created_at
    

**workflow_run**

- id
    
- workflow_id
    
- workflow_version_id
    
- trigger_id (nullable)
    
- status (QUEUED, RUNNING, SUCCESS, FAILED, CANCELLED)
    
- source (MANUAL, WEBHOOK, SCHEDULE)
    
- input_json
    
- started_at
    
- finished_at
    
- error_summary (nullable)
    

**node_run**

- id
    
- workflow_run_id
    
- node_id
    
- status (QUEUED, RUNNING, SUCCESS, FAILED, SKIPPED)
    
- input_json
    
- output_json
    
- error_json
    
- started_at
    
- finished_at
    

**event_log** (опционально, для аудита)

- id
    
- workflow_run_id
    
- node_run_id
    
- event_type (STATE_CHANGE, RETRY, ERROR, etc.)
    
- payload_json
    
- created_at
    

---

## 7. Выбор технологий

### 7.1. Frontend

- **Язык/стек:** TypeScript + React.
    
- **Canvas/Graph:** React Flow или аналог.
    
- **UI-кит:** MUI / Ant Design.
    
- **Auth:** OIDC (Auth0/Keycloak/Свой IdP).
    

### 7.2. Backend / Orchestrator / Worker

- **Язык:** Java 21.
    
- **Фреймворк:** Spring Boot (Web, Security, Data, Scheduler).
    
- **Build:** Gradle/Maven.
    
- **HTTP Client:** WebClient/OkHttp.
    
- **Persistence:** Spring Data JPA / jOOQ (jOOQ удобен для сложных запросов по run-state).
    
- **Message Queue:**
    
    - MVP: Redis Streams или Postgres-очередь (таблица jobs + SELECT FOR UPDATE SKIP LOCKED).
        
    - Target: Kafka или RabbitMQ.
        

Разделение на модули (даже если один деплой):

- `control-plane` (API + CRUD + Auth).
    
- `orchestrator` (planner, scheduler).
    
- `worker` (executor, может быть отдельным jar/сервисом).
    

### 7.3. Python Sandbox

- **Язык:** Python 3.x.
    
- **API:** HTTP (fastapi) или gRPC.
    
- **Изоляция:**
    
    - Контейнеры с ограничением CPU/Memory (Docker, cgroups).
        
    - Ограничение времени выполнения (timeout).
        
    - Ограничение модулей (разрешён whitelist: `math`, `statistics`, `pandas` – опционально).
        
    - Без сетевого доступа (или строго ограниченный).
        

### 7.4. Storage & Infra

- **DB:** PostgreSQL (12+).
    
- **Cache:** Redis (опционально).
    
- **Deploy:**
    
    - MVP: docker-compose.
        
    - Target: Kubernetes (k8s) для автоскейла воркеров.
        

---

## 8. C4: Component Diagram (для Backend API)

Внутри `Backend API` логические компоненты:

1. **AuthComponent**
    
    - Валидирует токены, вытаскивает user/project context.
        
2. **WorkflowService**
    
    - CRUD workflow/versions.
        
    - Валидация графа (acyclic, корректность типов нод).
        
3. **TriggerService**
    
    - CRUD триггеров.
        
    - Генерация/ротация webhook_token.
        
    - Интерфейс для Scheduler.
        
4. **RunService (Control Plane)**
    
    - Создание `WorkflowRun`.
        
    - Экспорт стейта для UI.
        
    - Агрегация node-run данных.
        
5. **OrchestratorComponent**
    
    - Планирование нод.
        
    - Работа с `JobQueue`.
        
    - Логика параллельного исполнения.
        
6. **WebhookController**
    
    - Публичный endpoint `/webhook/{token}`.
        
    - Маппит в Trigger → Workflow → RunService.
        
7. **GraphStateRepository / RunRepository**
    
    - Доступ к Postgres / (jOOQ-слой).
        

---

## 9. Масштабирование и эволюция до “большого” продукта

Заложенные механизмы для роста:

- Чёткое разделение Control Plane / Data Plane:
    
    - Control: управление графами и запуском.
        
    - Data (Workers): исполнение нод, тяжёлые вычисления.
        
- Очередь как абстракция:
    
    - Позволяет перейти с DB-очереди на Kafka без горячего переписывания бизнес-логики.
        
- Чистая доменная модель run-state:
    
    - На базе этого можно строить:
        
        - метрики “сколько людей дошли до ноды”,
            
        - групповой обзор по экспериментацию (A/B ветки),
            
        - версионирование с diff-ом и привязкой к метрикам.
            
- Python Sandbox как отдельный сервис:
    
    - Легко добавить JS/SQL sandbox-ы (ещё сервисы или общий executor).
        

---

Если хочешь, следующим шагом могу:

- Вытянуть эту архитектуру в формат C4 DSL (PlantUML или structurizr dsl),
    
- Или подробно расписать конкретные REST-контракты (request/response) для ключевых API + схемы таблиц в SQL.