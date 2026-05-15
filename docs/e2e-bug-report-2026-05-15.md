# E2E bug-report — 2026-05-15

Playwright e2e (`frontend/e2e/workflows.spec.ts`) против локальной связки backend (Spring Boot 3.5.3 + postgres-dev/minio-dev в Docker) + frontend (`ng serve`). **21 тест: 21 passed**.

---

## Что покрыто

- Список workflow: загрузка, пустое состояние, отсутствие console-errors
- Создание workflow → автоматический переход в редактор
- Открытие редактора кликом по карточке и кнопке «Открыть»
- Переименование с проверкой персистенса после reload
- Дублирование / удаление
- Открытие несуществующего workflow → видимый баннер ошибки
- Симуляция (500 users) → запись в execution log
- Закрытие модалки по Escape и по клику в backdrop
- Drag-n-drop ноды из палитры на canvas
- Smoke: backend `/v1/workflows` и `/v1/ws/info`

---

## Найденные и пофикшенные баги

| # | Баг | Файлы фикса | Статус |
|---|---|---|---|
| 1 | `ReferenceError: global is not defined` — sockjs-client требует Node-глобал, ленивый чанк редактора падал → router откатывал навигацию, кнопки «Создать»/«Открыть» как будто не работали | `frontend/src/polyfills.ts` (new), `frontend/angular.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.spec.json` | ✅ |
| 2 | WS endpoint не учитывал `context-path=/v1` — фронт лез на `/ws`, бэк отдавал на `/v1/ws` → SockJS падал по CORS/404 (в dev) и 404 (в проде) | `frontend/src/environments/environment.ts`, `frontend/nginx.conf` | ✅ |
| 3 | Модалка не закрывалась по Escape → backdrop блокировал клики по соседним кнопкам | `frontend/src/app/components/modal/modal.component.ts` | ✅ |
| 4 | `loadError` в редакторе устанавливался, но не рендерился в template | `frontend/src/app/pages/workflow-editor/workflow-editor.component.ts` | ✅ |
| 5 | `goBack()` стартовал save и сразу навигировал — HTTP отменялся при размонтировании компонента, изменения терялись | `frontend/src/app/pages/workflow-editor/workflow-editor.component.ts:goBack()` | ✅ |
| 6 | Spring Boot 4 → Jackson 3 (`tools.jackson.*`), но DTO/сервисы используют Jackson 2 (`com.fasterxml.jackson.*`) — все PUT/POST с полем `JsonNode` падают с `HttpMessageConversionException`. Фикс: downgrade `spring-boot-starter-parent` 4.0.0 → 3.5.3, замена `spring-boot-starter-webmvc` → `spring-boot-starter-web`, и `spring-boot-starter-liquibase` → `liquibase-core` (starter появился только в Boot 4). | `backend/pom.xml` | ✅ |

---

## BUG-6 — Jackson 2/3 mismatch (critical, open)

**Симптом:** PUT `/v1/workflow-versions/{id}/graph` → 500 (`HttpMessageConversionException: Type definition error: [simple type, class com.fasterxml.jackson.databind.JsonNode]`). Любое сохранение графа после изменений в редакторе теряется.

**Воспроизведение:**
```bash
# тест помечен test.fixme — раскомментируется после фикса
npx playwright test --grep "Drag node + save"
```

**Причина:** `backend/pom.xml:21` — `spring-boot-starter-parent` версии **4.0.0**. Boot 4 поставляет Jackson **3.x** под новым package `tools.jackson.databind.*` (новый namespace ввели в Jackson 3, см. [release notes](https://github.com/FasterXML/jackson/wiki/Jackson-Release-3.0)). MVC-конвертер использует Jackson 3, а DTO импортируют Jackson 2 → десериализатор не может смапить `tools.jackson` JSON в `com.fasterxml.jackson` тип.

**Затронутые файлы (17):**
```
backend/src/main/kotlin/ru/startem/aelevena/util/CanonicalJson.kt
backend/src/main/kotlin/ru/startem/aelevena/config/JacksonConfig.kt
backend/src/main/kotlin/ru/startem/aelevena/triggers/TriggerService.kt
backend/src/main/kotlin/ru/startem/aelevena/triggers/TriggerScheduler.kt
backend/src/main/kotlin/ru/startem/aelevena/workflow/WorkflowService.kt
backend/src/main/kotlin/ru/startem/aelevena/workflow/model/GraphSkeleton.kt
backend/src/main/kotlin/ru/startem/aelevena/api/RunsController.kt
backend/src/main/kotlin/ru/startem/aelevena/api/TriggersController.kt
backend/src/main/kotlin/ru/startem/aelevena/api/dto/TriggerDtos.kt
backend/src/main/kotlin/ru/startem/aelevena/api/dto/WorkflowDtos.kt
backend/src/main/kotlin/ru/startem/aelevena/api/dto/RunDtos.kt
backend/src/main/kotlin/ru/startem/aelevena/blob/BlobService.kt
backend/src/main/kotlin/ru/startem/aelevena/executor/HttpNodeExecutor.kt
backend/src/main/kotlin/ru/startem/aelevena/executor/PythonNodeExecutor.kt
backend/src/main/kotlin/ru/startem/aelevena/executor/DataflowNodeExecutors.kt
backend/src/main/kotlin/ru/startem/aelevena/executor/NodeExecutor.kt
backend/src/main/kotlin/ru/startem/aelevena/run/RunEnqueueService.kt
backend/src/main/kotlin/ru/startem/aelevena/run/RunQueryService.kt
backend/src/main/kotlin/ru/startem/aelevena/run/WorkflowExecutionService.kt
```

**Варианты фикса:**

1. **Downgrade Spring Boot до 3.5.x** — Jackson остаётся 2.x. Минимум миграционных изменений, но теряем фичи Boot 4. Изменить `pom.xml:21`.
2. **Полная миграция на Jackson 3** — заменить `com.fasterxml.jackson.databind.*` → `tools.jackson.databind.*` во всех 17 файлах. ObjectMapper builder тоже сменил API. Большой объём, но «правильный» путь.
3. **Принудительно держать Jackson 2 ObjectMapper в HTTP-конвертере** — переопределить `WebMvcConfigurer.configureMessageConverters` с явным Jackson 2 `MappingJackson2HttpMessageConverter`. Хрупко, может конфликтовать с автоконфигом Boot 4.

**Рекомендую: вариант 1** (downgrade). Проект явно был написан под Boot 3 (старые namespaces, классические тесты), а Boot 4 был выбран случайно при `spring init`. Один абзац в pom.xml, протестируется тем же e2e сразу.

---

## Что НЕ покрыто этим прогоном (стоит добавить)

| Сценарий | Почему важно |
|---|---|
| Соединение нод (`Connection`) | Валидация duplicate id, edge persistence |
| Создание триггера через `app-triggers-panel` | Эндпоинт `POST /v1/triggers` явно завязан на JsonNode → блокировано BUG-6 |
| Запуск run через `POST /v1/workflows/{id}/runs` | То же — JsonNode в payload |
| WS-broadcast: правка в одной вкладке отражается в другой | STOMP-роутинг, проверка ws/graph topic |
| Удаление одной ноды через inspector | Дырки в `edges` после удаления |
| Inspector с разными типами нод | abConfig vs config, разные шаблоны полей |

---

## Воспроизведение

```bash
# infra (postgres+minio)
docker compose -f backend/docker-compose.dev.yml up -d

# backend
cd backend
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/a11a \
SPRING_DATASOURCE_USERNAME=a11a SPRING_DATASOURCE_PASSWORD=a11a \
APP_S3_ENDPOINT=http://localhost:6005 \
APP_S3_ACCESS_KEY=minioadmin APP_S3_SECRET_KEY=minioadmin APP_S3_BUCKET=a11a-blobs \
mvn -q spring-boot:run

# frontend
cd frontend && npx ng serve

# e2e
cd frontend && npx playwright test
# HTML-отчёт: frontend/playwright-report/index.html
```
