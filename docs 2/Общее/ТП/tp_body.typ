= ВВЕДЕНИЕ
== Наименование программы
Полное наименование: «Платформа для no-code автоматизации бизнес-процессов».\
Внутреннее имя продукта команды: FluxPilot.\
Наименование на английском языке: «No-code business process automation platform».

== Краткая характеристика области применения
Программный продукт предназначен для визуального проектирования и автоматического исполнения бизнес-процессов без необходимости написания программного кода со стороны конечного пользователя. Используется для интеграции между внутренними и внешними информационными системами через HTTP-запросы; обработки, фильтрации и трансформации потоков данных; реагирования на события по расписанию или через входящие HTTP-запросы (webhooks); проведения A/B-экспериментов с разделением пользовательского трафика и подсчётом доверительных интервалов конверсии. Продукт состоит из двух функциональных частей: серверной (Kotlin + Spring Boot) и клиентской (Angular).

= ТЕКСТ ПРОГРАММЫ

== Размещение исходного кода и развёрнутая инстанция
Полный текст программы размещён в открытом Git-репозитории проекта по адресу:

#align(center)[#link("https://github.com/arklual/cursach")[*github.com/arklual/cursach*]]

Репозиторий публичен и не требует аутентификации для чтения. Репозиторий содержит: исходный код серверной части (Kotlin на Spring Boot 3.5.3), исходный код клиентской части (TypeScript на Angular 19.2), конфигурацию схемы реляционной базы данных (миграции Liquibase в YAML), сценарии end-to-end-тестирования (Playwright), конфигурацию сборки (Maven для backend, npm для frontend), конфигурацию контейнерного развёртывания (Docker Compose для development и production окружений), конфигурацию непрерывной интеграции и доставки (GitHub Actions с автоматическим прогоном тестов, сборкой Docker-образов и публикацией в GitHub Container Registry).

Снимок исходного кода, соответствующий настоящему документу, зафиксирован в репозитории тегом `v1.0-defense` (создаётся непосредственно перед защитой курсовой работы).

Развёрнутая (промышленная) инстанция программы публично доступна по адресу:

#align(center)[#link("https://fluxpilot.ru/")[*fluxpilot.ru*]]

Развёртывание выполнено по конфигурации `deploy/docker-compose.prod.yml`: PostgreSQL 16, MinIO, backend (Spring Boot), frontend (Nginx с TLS-сертификатом Let's Encrypt), docker-socket-proxy для безопасного доступа backend к docker daemon хоста. Интерактивная документация REST API доступна по адресу #link("https://fluxpilot.ru/v1/swagger-ui.html")[`https:\/\/fluxpilot.ru/v1/swagger-ui.html`].

== Структура репозитория

#figure(caption: [Структура корневого каталога репозитория], table(columns: (35mm, auto), align: horizon,
    table.header([*Директория*], [*Назначение*]),
    [`backend/`], [Серверная часть на Kotlin 2.2 + Spring Boot 3.5.3 (около 55 файлов .kt, около 3 500 строк кода)],
    [`frontend/`], [Клиентская часть на Angular 19.2 + TypeScript 5.6 (около 45 файлов .ts)],
    [`deploy/`], [Docker Compose файлы для development (`docker-compose.dev.yml`) и production (`docker-compose.prod.yml`) развёртываний],
    [`docs/`], [Техническая документация: PlantUML-диаграммы (ER, sequence, C2/C3-компоненты), UX-спецификации, отчёты],
    [`.github/`], [CI/CD конфигурация GitHub Actions: `workflows/ci.yml` (тесты), `workflows/coverage-badge.yml` (бейдж покрытия), `workflows/backend.yml`, `workflows/frontend.yml` (сборка и публикация Docker-образов)],
    [`scripts/`], [Вспомогательные shell-скрипты (посев данных, очистка тестовых окружений, валидация конфигов)],
    [`README.md`], [Обзор проекта, быстрый старт, ссылки на документацию],
))

== Модули серверной части

Серверная часть реализована в корневом пакете `ru.startem.aelevena`, разделённом на одиннадцать пакетов с однонаправленными зависимостями.

#figure(caption: [Модули серверной части], table(columns: (30mm, auto), align: horizon,
    table.header([*Пакет*], [*Назначение*]),
    [`api`], [REST-контроллеры (WorkflowsController, RunsController, WorkflowVersionsController, WorkflowSnapshotsController, TriggersController, AbAnalyticsController), глобальный обработчик исключений RestExceptionHandler],
    [`api.dto`], [Data Transfer Object для REST-запросов и ответов],
    [`workflow`], [Доменный сервис WorkflowService, репозитории CRUD (включая WorkflowSnapshotRepository)],
    [`run`], [Ядро исполнения WorkflowExecutionService (Кан + CompletableFuture), репозитории WorkflowRunRepository, NodeRunRepository],
    [`executor`], [Интерфейс NodeExecutor, реестр NodeExecutorRegistry; общий движок песочницы ContainerSandboxRunner; реализации HttpNodeExecutor, PythonNodeExecutor, JavaScriptNodeExecutor, DataflowNodeExecutors, TriggerWebhookExecutor, BranchSplitNodeExecutor/BranchSplitStrategies/SplitEnvelope, BranchMergeNodeExecutor; SandboxImageWarmer],
    [`triggers`], [TriggerService, TriggerScheduler (cron), TriggersRepository],
    [`blob`], [BlobService (content-addressed-MinIO), BlobIndexRepository],
    [`ws`], [GraphBroadcastListener (трансляция событий через STOMP), WorkflowWsController, WebSocketBrokerConfig],
    [`analytics`], [AbAnalyticsService, AbAnalyticsRepository, StatTest (z-тест разности конверсий), AbAnalyticsDtos],
    [`seed`], [DemoWorkflowSeeder, DemoWorkflowPlan + подпакет seed.plans с готовыми планами демо-workflow],
    [`config`], [OpenApiConfig, JacksonConfig, S3Config, S3Properties, WebMvcConfig],
    [`util`], [CanonicalJson (канонизация JSON), Hashing (SHA-256)],
))

== Модули клиентской части

Клиентская часть — одностраничное приложение (Single-Page Application) на Angular 19.2. Кодовая база — около 45 файлов TypeScript исходного кода, около 10 файлов модульных тестов на Jasmine + Karma и 8 файлов end-to-end-тестов на Playwright.

#figure(caption: [Модули клиентской части], table(columns: (50mm, auto), align: horizon,
    table.header([*Каталог*], [*Назначение*]),
    [`src/app/pages/workflow-editor`], [Главная страница редактора workflow],
    [`src/app/pages/workflows-list`], [Список workflow с возможностью поиска],
    [`src/app/pages/not-found`], [Страница 404],
    [`src/app/components/workflow-canvas`], [Интерактивный холст: drag-and-drop, рисование рёбер SVG-кривыми Безье, zoom и pan, селекция],
    [`src/app/components/workflow-node`], [Визуальное представление одного узла],
    [`src/app/components/palette`], [Палитра типов узлов с группировкой по категориям],
    [`src/app/components/inspector`], [Панель конфигурации выделенного узла с динамическим выбором формы],
    [`src/app/components/runs-panel`], [Боковая панель со списком запусков workflow и переключением между ними],
    [`src/app/components/execution-panel`], [Подробный просмотр одного запуска с детализацией каждого node_run, входов/выходов и сообщений об ошибках],
    [`src/app/components/snapshots-panel`], [Панель управления именованными снапшотами workflow (создание, чтение, восстановление)],
    [`src/app/components/analytics-panel`], [Вкладка нижней панели с продуктовой аналитикой A/B-эксперимента (traffic bars, conversion table, доверительные интервалы)],
    [`src/app/components/canvas-empty`], [Заглушка холста для нового workflow],
    [`src/app/components/onboarding-tour`], [Онбординг-тур для новых пользователей],
    [`src/app/components/modal`], [Универсальный контейнер модальных окон (создание workflow, snapshot и др.)],
    [`src/app/core/api`], [REST-фасады и маперы (workflow.api.ts, run.api.ts, trigger.api.ts, analytics.api.ts, workflow.facade.ts, workflow.mapper.ts) + сгенерированные типы OpenAPI (`api.types.ts`)],
    [`src/app/core/ws`], [WebSocket-клиент на `@stomp/stompjs` + sockjs-client (workflow-ws.service.ts)],
    [`src/app/services`], [Сервисы уровня приложения: workflow.service (CRUD-фасад), execution.service (запуск и подписка на события), workflow-validator.service (валидация графа на клиенте перед сохранением)],
    [`src/app/models`], [Модели данных (workflow.model.ts, execution.model.ts)],
))

== Зависимости серверной части

#figure(caption: [Технологические зависимости серверной части], table(columns: (40mm, 20mm, auto), align: horizon,
    table.header([*Технология*], [*Версия*], [*Назначение*]),
    [Kotlin], [2.2.21], [Язык программирования],
    [JDK], [24], [Runtime JVM],
    [Spring Boot], [3.5.3], [Каркас приложения],
    [springdoc-openapi], [2.7.0], [OpenAPI 3.0 + Swagger UI],
    [Liquibase], [4.x], [Миграции схемы PostgreSQL],
    [PostgreSQL JDBC], [42.x], [Драйвер PostgreSQL 16],
    [AWS SDK (S3 client)], [2.31.78], [Клиент MinIO],
    [Jackson Kotlin module], [актуальная], [Сериализация JSON],
    [JUnit Jupiter], [5.x], [Модульные тесты],
    [Testcontainers], [1.21.1], [Интеграционные тесты],
    [JaCoCo], [0.8.13], [Отчёт покрытия],
    [Apache Maven], [3.9], [Сборка backend],
))

== Зависимости клиентской части

#figure(caption: [Технологические зависимости клиентской части], table(columns: (40mm, 20mm, auto), align: horizon,
    table.header([*Технология*], [*Версия*], [*Назначение*]),
    [Angular], [19.2.0], [Каркас SPA],
    [TypeScript], [5.6], [Язык программирования],
    [RxJS], [7.8.0], [Реактивные потоки],
    [Angular CDK], [19.2], [Drag-and-drop, overlay, accessibility],
    [Chart.js], [4.4.6], [Диаграммы продуктовой аналитики],
    [\@stomp/stompjs], [7.3.0], [STOMP-клиент над WebSocket],
    [sockjs-client], [1.6.1], [SockJS-fallback для WebSocket],
    [Jasmine], [актуальная], [Каркас модульных тестов],
    [Karma], [актуальная], [Test runner],
    [Playwright], [1.59.1], [End-to-end-тесты],
    [Node.js], [20 LTS], [Runtime для сборки и тестов],
    [npm], [10+], [Менеджер пакетов],
))

== Инструкция по сборке

=== Предварительные требования
JDK 24, Apache Maven 3.9+ (или встроенный Maven Wrapper `./mvnw` в `backend/`), Node.js 20 LTS, npm 10+, Docker Engine 20.10+ с Docker Compose, PostgreSQL 16 (поднимается через Docker Compose), MinIO (поднимается через Docker Compose).

=== Сборка серверной части
Полная сборка с прогоном тестов и отчётом покрытия:\
`cd backend && mvn clean verify`\
Результат: fat-JAR в `backend/target/aelevena-*.jar`; HTML-отчёт покрытия в `backend/target/site/jacoco/index.html`.

Сборка без тестов (для быстрых пересборок):\
`cd backend && mvn package -DskipTests`

=== Сборка клиентской части
Установка зависимостей и production-сборка:\
`cd frontend && npm ci && npm run build`\
Результат: статический бандл в `frontend/dist/`.

=== Локальное развёртывание (development)
Шаг 1 — инфраструктура: `docker compose -f deploy/docker-compose.dev.yml up -d`\
Шаг 2 — backend: `cd backend && mvn spring-boot:run`\
Шаг 3 — frontend: `cd frontend && npm start`\
Клиентское приложение: `http://localhost:4200`\
Swagger UI: `http://localhost:8080/v1/swagger-ui.html`\
MinIO Console: `http://localhost:6006`

=== Развёртывание (production)
`docker compose -f deploy/docker-compose.prod.yml up -d`\
Поднимает полный стек: PostgreSQL, MinIO, backend, frontend (Nginx с SSL), docker-socket-proxy. Доступ извне только через Nginx (порты 80/443).

=== Запуск автоматических тестов
Серверные модульные и интеграционные: `cd backend && mvn verify`\
Клиентские модульные: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`\
End-to-end (Playwright): `cd frontend && npx playwright test`

== Непрерывная интеграция и доставка

Репозиторий настроен на автоматический прогон полного цикла тестов на каждый pull request и push в `main` через GitHub Actions. Основные workflow:\
— `.github/workflows/ci.yml` — сборка backend, прогон модульных и интеграционных тестов на JDK 24 с поднятыми сервисными контейнерами PostgreSQL и MinIO; сборка frontend; прогон модульных тестов frontend (Jasmine + Karma в ChromeHeadless); прогон end-to-end тестов (Playwright);\
— `.github/workflows/coverage-badge.yml` — генерация SVG-бейджа покрытия на основе `target/site/jacoco/jacoco.csv`, коммит в `.github/badges/jacoco.svg`;\
— `.github/workflows/backend.yml` — сборка Docker-образа serverной части, публикация в `ghcr.io/arklual/cursach-backend:<sha>` и `:latest`, деплой на VPS через SSH;\
— `.github/workflows/frontend.yml` — аналогично для клиентской части (Nginx с TLS).

Бейджи статуса CI, покрытия и лицензии встроены в `README.md` репозитория.

#set heading(numbering: none)
= СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
1. Spring Boot Reference Documentation [Электронный ресурс]. — URL: https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/ (дата обращения: 05.12.2025).
2. Kotlin Language Documentation [Электронный ресурс]. — URL: https://kotlinlang.org/docs/home.html (дата обращения: 08.12.2025).
3. Angular Documentation [Электронный ресурс] / Google. — URL: https://angular.dev/ (дата обращения: 10.12.2025).
4. Apache Maven Documentation [Электронный ресурс]. — URL: https://maven.apache.org/guides/ (дата обращения: 14.01.2026).
5. npm Documentation [Электронный ресурс]. — URL: https://docs.npmjs.com/ (дата обращения: 16.01.2026).
6. Docker Engine Documentation [Электронный ресурс]. — URL: https://docs.docker.com/engine/ (дата обращения: 18.03.2026).
7. GitHub Actions Documentation [Электронный ресурс]. — URL: https://docs.github.com/en/actions (дата обращения: 25.04.2026).
