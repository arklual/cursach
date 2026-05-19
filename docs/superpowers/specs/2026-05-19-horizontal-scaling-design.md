# Horizontal scaling for pipeline execution — Design

**Date:** 2026-05-19
**Status:** approved (brainstorm), pending implementation plan
**Scope:** позволить запускать backend FluxPilot в несколько реплик так, чтобы
runs пайплайнов распределялись между ними, переживали падения одной реплики
и не дублировались (cron, WS-апдейты). Никаких новых сервисов кроме
существующего Postgres.

---

## 1. Goal

Сейчас выполнение run'ов привязано к JVM, которая получила HTTP-запрос:
`RunEnqueueService` после коммита транзакции делает локальный
`workflowExecutor.submit { execute(runId) }`. Всё промежуточное состояние
(`outputs`, `started`, `skippedSet`) живёт в heap'е одной JVM. Это даёт:

- run прибит к одной реплике; при крахе реплики run навсегда остаётся в
  `status='running'` без шанса быть завершённым;
- неравномерная нагрузка (один инстанс перегружен, другой простаивает);
- `TriggerScheduler` на N репликах выстреливает cron N раз;
- WS-апдейты прогресса видны только клиентам на той реплике, что исполняет run.

**Цель этого дизайна** — превратить deploy в горизонтально-масштабируемый
без переусложнения. Пользовательский опыт:

```bash
docker compose -f docker-compose.prod.yml up -d --scale backend=3
```

— и работает. Любая реплика принимает HTTP-запросы, любая выполняет runs, любая
получает live-апдейты в подключённых WS-клиентов. При падении одной реплики
её незавершённые runs автоматически перезапускаются на другой.

**Non-goals (явный YAGNI):**

- Распределение нод одного run между репликами. Один run — целиком на одной
  реплике.
- Exactly-once семантика side-effects (HTTP-ноды и т. п.). Семантика
  at-least-once с явной фиксацией ограничения.
- Redis / RabbitMQ / Kafka. Только Postgres.
- Auto-scaling, HPA, cancel run, отдельный sandbox-воркер. Не сейчас.

---

## 2. Architecture (high level)

Каждый backend-контейнер — это и API, и worker одновременно. Postgres
выступает в роли:

- **очереди задач** — таблица `workflow_run` со статусами `queued` → `running` →
  `success|failed`, claim через `SELECT ... FOR UPDATE SKIP LOCKED`;
- **координатора аренды** — поля `lease_owner`, `lease_until`, `attempt`,
  `last_heartbeat` на той же таблице;
- **мьютекса лидера cron** — `pg_try_advisory_lock(<key>)`;
- **шинного транспорта для WS** — `LISTEN/NOTIFY` на канале `ws_broadcast`.

```
┌─────────────┐   HTTP/WS    ┌──────────────────────────────┐
│   nginx     │ ───────────→ │ backend replica #1           │
│ (frontend)  │              │  - REST API                  │
│ round-robin │              │  - RunWorker (poll loop)     │
│   via DNS   │              │  - LISTEN ws_broadcast       │ ──┐
└─────────────┘              │  - Cron leader? maybe        │   │
       │                     └──────────────────────────────┘   │
       │                                                        │
       └──→ backend replica #2  (same shape, may be cron lead) ──┤   ┌──────────────┐
       │                                                        ├─→ │  Postgres    │
       └──→ backend replica #3  (same shape)                    │   │ - queue      │
                                                                │   │ - lease      │
                                                                │   │ - LISTEN/    │
                                                                │   │   NOTIFY     │
                                                                │   │ - advisory   │
                                                                │   │   lock       │
                                                                │   └──────────────┘
                                                                │
       Heavy node executors (Python/JS sandbox) — Docker        │
       контейнеры на том же хосте, где исполняется run.         │
       Запускаются через docker-proxy (как сейчас).             │
```

---

## 3. Database changes

Одна Liquibase-миграция: `006-distributed-runs.yaml`.

### 3.1 Изменения в `workflow_run`

Добавляем 4 колонки:

| Колонка | Тип | Назначение |
|---|---|---|
| `lease_owner` | `varchar(64)` nullable | UUID реплики, удерживающей run сейчас. NULL для `queued`/`success`/`failed`. |
| `lease_until` | `timestamptz` nullable | До этого момента lease считается валидным. NULL если run не в `running`. |
| `attempt` | `int not null default 0` | Число попыток выполнения (инкрементится при каждом claim). |
| `last_heartbeat` | `timestamptz` nullable | Время последнего успешного heartbeat-обновления — для диагностики. |

Новые индексы:

- `ix_workflow_run_status_created` `on (status, created_at) where status='queued'`
  — для дешёвой выборки очереди.
- `ix_workflow_run_lease_until` `on (lease_until) where status='running'`
  — для janitor-сканов.

### 3.2 `node_run` не меняется

Append-only внутри одного run. После failover старые `node_run`-строки от
предыдущей попытки сохраняются (полезны для диагностики), но не используются
при повторном выполнении — execute начинается с топологически чистого старта.

### 3.3 Конфиг

`application.yml` (новые ключи под `app.execution`):

```yaml
app:
  execution:
    node-id: ${APP_NODE_ID:}                # пусто → сгенерируем UUID при старте
    max-runs-per-node: ${APP_EXECUTION_MAX_RUNS:0}  # 0 = auto (CPU * 2)
    lease-seconds: 30
    heartbeat-seconds: 10
    poll-interval-ms: 1000
    janitor-interval-seconds: 30
    max-attempts: 3
    notify-on-enqueue: true                 # NOTIFY workflow_run_enqueued
    leader:
      cron-key: 2728100100                  # arbitrary stable int8 for pg_advisory_lock
      reacquire-interval-seconds: 30
```

---

## 4. Жизненный цикл одного run

```
┌──────────────────────────────────────────────────────────────────────────┐
│  enqueue (любая реплика, через REST / webhook / cron-leader)             │
│    INSERT INTO workflow_run (status='queued', attempt=0, ...) RETURNING id│
│    NOTIFY workflow_run_enqueued                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  RunWorker.tick() — @Scheduled(fixedDelay = poll-interval-ms)            │
│  for slot in (max-runs-per-node - inflight.size):                        │
│    runId = RunLeaseRepository.claimNext(nodeId, lease-seconds)           │
│    if runId == null: break                                               │
│    workflowExecutor.submit { runWithLease(runId) }                       │
└──────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  runWithLease(runId):                                                    │
│    heartbeat = RunHeartbeat.start(runId)   // ScheduledFuture every 10s  │
│    try:                                                                  │
│      WorkflowExecutionService.execute(runId)                             │
│      // execute() сам вызывает workflowRuns.markFinished(...) внутри;    │
│      // wrapper за это не отвечает.                                      │
│    finally:                                                              │
│      heartbeat.close()                                                   │
│      RunLeaseRepository.releaseLease(runId, nodeId)                      │
└──────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  RunJanitor.tick() — @Scheduled(fixedDelay = janitor-interval-seconds)   │
│  UPDATE workflow_run                                                     │
│  SET status = CASE WHEN attempt >= :maxAttempts THEN 'failed'            │
│                                                 ELSE 'queued' END,       │
│      lease_owner = NULL, lease_until = NULL,                             │
│      finished_at = CASE WHEN attempt >= :maxAttempts THEN now()          │
│                                                      ELSE finished_at END│
│  WHERE status = 'running' AND lease_until < now();                       │
└──────────────────────────────────────────────────────────────────────────┘
```

Семантика **at-least-once**: при failover'е run перезапускается с нуля. Side-
effects, которые успели произойти в первой попытке (например, HTTP-нода уже
сделала POST), произойдут повторно. Это известное ограничение первой версии
— фиксируем в README; план B (idempotency-ключи) — отдельный последующий
тикет.

---

## 5. Новые компоненты в коде

Все — в существующем пакете `ru.startem.aelevena.run` (или `.ws` для
broadcast'а).

### 5.1 `NodeIdentity` (`run/NodeIdentity.kt`)

```kotlin
@Component
class NodeIdentity(
    @Value("\${app.execution.node-id:}") nodeIdProp: String,
) {
    val nodeId: String = nodeIdProp.takeIf { it.isNotBlank() }
        ?: UUID.randomUUID().toString()
    @PostConstruct fun log() { /* log "node id = $nodeId" */ }
}
```

`nodeId` — это значение колонки `lease_owner` для runs, заклеймленных этим
JVM. Можно зафиксировать через env (для kube StatefulSet) либо оставить
автогенерацию (для docker-compose).

### 5.2 `RunLeaseRepository` (`run/RunLeaseRepository.kt`)

Атомарные операции аренды. Все методы — единые UPDATE-SELECTs.

```kotlin
@Repository
class RunLeaseRepository(jdbc: NamedParameterJdbcTemplate) {
    // Возвращает runId или null. Использует SKIP LOCKED.
    fun claimNext(nodeId: String, leaseSeconds: Int): Long?

    // Продлевает lease если он ещё за нами. Возвращает true/false.
    fun heartbeat(runId: Long, nodeId: String, leaseSeconds: Int): Boolean

    // Освобождает lease после finalize. Идемпотентно.
    fun releaseLease(runId: Long, nodeId: String)

    // Возвращает все ещё in-flight runs этого узла в queued при graceful shutdown.
    fun releaseInFlight(nodeId: String): Int

    // Возвращает «протухшие» аренды в очередь либо в failed (если attempt > maxAttempts).
    fun reclaimExpired(maxAttempts: Int): ReclaimStats
}
data class ReclaimStats(val requeued: Int, val failed: Int)
```

`claimNext` SQL:
```sql
UPDATE workflow_run wr
SET status='running',
    lease_owner = :nodeId,
    lease_until = now() + (:leaseSeconds || ' seconds')::interval,
    attempt = attempt + 1,
    started_at = COALESCE(started_at, now()),
    last_heartbeat = now()
WHERE id = (
  SELECT id FROM workflow_run
  WHERE status='queued'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING wr.id;
```

### 5.3 `RunWorker` (`run/RunWorker.kt`)

```kotlin
@Component
class RunWorker(
    private val leases: RunLeaseRepository,
    private val executor: WorkflowExecutionService,
    private val heartbeat: RunHeartbeat,
    private val pool: ExecutorService,           // = существующий workflowExecutor
    private val nodeIdentity: NodeIdentity,
    private val props: ExecutionProps,
) {
    private val inflight = ConcurrentHashMap.newKeySet<Long>()
    @Volatile private var shuttingDown = false

    @Scheduled(fixedDelayString = "\${app.execution.poll-interval-ms}")
    fun tick() {
        if (shuttingDown) return
        val capacity = props.maxRunsPerNode - inflight.size
        repeat(capacity) {
            val runId = leases.claimNext(nodeIdentity.nodeId, props.leaseSeconds) ?: return
            inflight += runId
            pool.submit { runWithLease(runId) }
        }
    }

    private fun runWithLease(runId: Long) {
        val hb = heartbeat.start(runId)
        try {
            executor.execute(runId)              // существующий код, без изменений в теле
        } finally {
            hb.close()
            leases.releaseLease(runId, nodeIdentity.nodeId)
            inflight -= runId
        }
    }

    @PreDestroy
    fun shutdown() {
        shuttingDown = true
        // ждём ~30s; что не успело — releaseInFlight (см. §7)
        ...
    }
}
```

Важно: `RunEnqueueService.enqueue` теперь **не** вызывает
`executionService.start(runId)`. Просто INSERT и (опционально) NOTIFY.
`TransactionSynchronization` уходит.

### 5.4 `RunHeartbeat` (`run/RunHeartbeat.kt`)

```kotlin
@Component
class RunHeartbeat(
    private val leases: RunLeaseRepository,
    private val nodeIdentity: NodeIdentity,
    private val props: ExecutionProps,
) {
    private val ticker: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()

    fun start(runId: Long): AutoCloseable {
        val future = ticker.scheduleAtFixedRate({
            leases.heartbeat(runId, nodeIdentity.nodeId, props.leaseSeconds)
        }, props.heartbeatSeconds.toLong(), props.heartbeatSeconds.toLong(), TimeUnit.SECONDS)
        return AutoCloseable { future.cancel(false) }
    }
}
```

`heartbeat()` SQL:
```sql
UPDATE workflow_run
SET lease_until = now() + (:leaseSeconds || ' seconds')::interval,
    last_heartbeat = now()
WHERE id = :runId AND lease_owner = :nodeId AND status = 'running';
```

Если возвращает 0 rows updated — lease у нас украл janitor; логируем
warn-сообщение. Текущий поток выполнения этого run всё равно продолжается до
завершения; повторное выполнение происходит на другой реплике. Это и есть
«запланированная» цена at-least-once.

### 5.5 `RunJanitor` (`run/RunJanitor.kt`)

```kotlin
@Component
class RunJanitor(private val leases: RunLeaseRepository, private val props: ExecutionProps) {
    @Scheduled(fixedDelayString = "\${app.execution.janitor-interval-seconds}000")
    fun tick() {
        val stats = leases.reclaimExpired(props.maxAttempts)
        if (stats.requeued + stats.failed > 0) log.info(...)
    }
}
```

`reclaimExpired` SQL — одна UPDATE с CASE по `attempt`, см. псевдокод в §4.

### 5.6 `LeaderElection` (`run/LeaderElection.kt`)

```kotlin
@Component
class LeaderElection(
    @Value("\${spring.datasource.url}") private val url: String,
    @Value("\${spring.datasource.username}") private val user: String,
    @Value("\${spring.datasource.password}") private val pass: String,
) {
    // Выделенный pgjdbc-Connection — берётся напрямую через DriverManager,
    // НЕ из HikariCP. Это критично: HikariCP имеет maxLifetime (default 30 мин)
    // и принудительно закроет коннект, отпустив advisory lock без нашего ведома.
    @Volatile private var leaderConn: Connection? = null

    fun tryAcquire(key: Long): Boolean {
        if (leaderConn?.isValid(1) == true) return true
        val conn = DriverManager.getConnection(url, propsWithKeepalive(user, pass))
        return runCatching {
            conn.autoCommit = true
            val ok = conn.prepareStatement("SELECT pg_try_advisory_lock(?)")
                .also { it.setLong(1, key) }
                .executeQuery()
                .use { rs -> rs.next() && rs.getBoolean(1) }
            if (ok) { leaderConn = conn; true } else { conn.close(); false }
        }.getOrElse { conn.runCatching { close() }; false }
    }

    @PreDestroy fun release() { leaderConn?.runCatching { close() } }

    private fun propsWithKeepalive(user: String, pass: String): java.util.Properties =
        java.util.Properties().apply {
            setProperty("user", user); setProperty("password", pass)
            setProperty("tcpKeepAlive", "true")
        }
}
```

`pg_try_advisory_lock` — session-level, освобождается при разрыве соединения.
Поэтому Connection держим **вне HikariCP**: напрямую через `DriverManager` с
`tcpKeepAlive=true`. `@PreDestroy` явно закрывает коннект (это сразу отпускает
lock — следующий старт-лидера на другой реплике подхватит на ближайшем
retry-тике).

### 5.7 Изменения в `TriggerScheduler.kt`

- В `onReady()` сначала вызвать `leaderElection.tryAcquire(props.cronKey)`.
  Если `false` — `taskScheduler.scheduleAtFixedRate(retry, 30s)`, где `retry`
  пытается захватить снова, и при успехе вызывает `listEnabledScheduled().forEach { schedule(it) }`.
- Если `true` — текущая логика без изменений.
- При перезапуске сервиса cancel всех ранее зашедуленных future остаётся
  как есть.
- Webhook- и manual-триггеры (которые сейчас идут через REST → `enqueue`)
  **не требуют лидера** — это просто HTTP-запросы, любая реплика обрабатывает.

### 5.8 `PgNotifyBroadcaster` (`ws/PgNotifyBroadcaster.kt`)

Мост Postgres LISTEN/NOTIFY ↔ Spring `SimpMessagingTemplate`.

Два публичных метода:

```kotlin
@Component
class PgNotifyBroadcaster(
    private val dataSource: DataSource,
    private val messaging: SimpMessagingTemplate,
    private val objectMapper: ObjectMapper,
) {
    // Шлёт NOTIFY в канал ws_broadcast. Слушатели на всех репликах поднимут.
    fun publish(destination: String, payload: Any) { ... }

    // Запускается в @PostConstruct — заводит выделенный pgjdbc Connection,
    // делает LISTEN ws_broadcast и в фоновом потоке вызывает getNotifications()
    // в цикле. На каждый notify — messaging.convertAndSend(dst, payload).
}
```

Изменения в `GraphBroadcastListener.kt` и прочих местах, где сейчас вызывается
`messaging.convertAndSend(...)`: заменяем на `pgNotifyBroadcaster.publish(...)`.
Это включает progress-апдейты прогона нод (если такие есть в текущем коде —
надо проверить при имплементации; если нет, добавляем точку publish уже в
`WorkflowExecutionService.execute()` после каждой смены статуса ноды).

Payload format:
```json
{ "destination": "/topic/workflows/<runId>/runs", "payload": { ...real data... } }
```

Postgres NOTIFY имеет лимит payload ~8000 байт; для текущих апдейтов
(имя ноды, статус) этого хватает с большим запасом.

### 5.9 Изменения в `RunEnqueueService.kt`

До:
```kotlin
@Transactional fun enqueue(...): Long {
  ...
  val runId = workflowRuns.insertQueued(...)
  if (TransactionSynchronizationManager.isSynchronizationActive()) { ... executionService.start(runId) }
  else { executionService.start(runId) }
  return runId
}
```

После:
```kotlin
@Transactional fun enqueue(...): Long {
  ...
  val runId = workflowRuns.insertQueued(...)
  if (props.notifyOnEnqueue) pgNotify("workflow_run_enqueued", runId.toString())
  return runId
}
```

`workflowExecutor`-submit удаляется. `executionService.start(runId)` —
public-метод (`fun start(runId)`) удаляется; остаётся только `execute(runId)`,
вызываемый `RunWorker`.

`notify` опционально ускоряет wake-up (без него — 1-секундный poll); если не
сработает (например, потеря NOTIFY) — voucher всё равно подхватится через
следующий `tick()`.

### 5.10 Изменения в `ExecutionConfig.kt`

Существующий `workflowExecutor` остаётся — он используется внутри
`execute()` через `thenApplyAsync(..., workflowExecutor)` для параллельного
выполнения нод одного run. Размер делаем конфигурируемым:

```kotlin
@Bean(name = ["workflowExecutor"], destroyMethod = "shutdown")
fun workflowExecutor(): ExecutorService =
    Executors.newFixedThreadPool(
        maxOf(4, Runtime.getRuntime().availableProcessors() * 2),
        factory("workflow-node"),
    )
```

**Новый отдельный пул** для `RunWorker.runWithLease(...)` — драйверов run-уровня,
которые блокирующе ждут `CompletableFuture.allOf(...).join()`:

```kotlin
@Bean(name = ["runDispatcherPool"], destroyMethod = "shutdown")
fun runDispatcherPool(props: ExecutionProps): ExecutorService {
    val size = if (props.maxRunsPerNode > 0) props.maxRunsPerNode
               else maxOf(2, Runtime.getRuntime().availableProcessors())
    return Executors.newFixedThreadPool(size, factory("workflow-dispatch"))
}
```

Почему **обязательно** два разных пула: драйвер run'а блокирует свой тред на
`join()`. Если бы драйверы и ноды делили один пул, при
`maxRunsPerNode == poolSize` все треды бы заняли драйверы, ноды бы не получали
исполнителя — классический deadlock. С двумя пулами драйверов ровно
`maxRunsPerNode`, нод — отдельные `2 × CPU`.

`ExecutionProps` — новый `@ConfigurationProperties(prefix = "app.execution")` POJO.
В `RunWorker` `@Qualifier("runDispatcherPool")` инжектится отдельным
бином, а `WorkflowExecutionService` продолжает получать `@Qualifier("workflowExecutor")`
как сейчас.

### 5.11 Изменения в `WorkflowExecutionService.kt`

Минимальные:

- Удаляется метод `start(runId)`. Тело остаётся методом `execute(runId)` без
  изменений.
- Класс перестаёт зависеть от `workflowExecutor` напрямую — пул нужен только
  внутри `execute()` для `thenApplyAsync(..., workflowExecutor)`, что не
  меняется (внутри одного run всё ещё параллелим ноды на локальном пуле).
- Метод `markFinished(...)` — единственная точка, где статус run переходит в
  `success/failed`. После него `RunWorker` вызывает `releaseLease`.

---

## 6. Cron-триггеры (детально)

| Шаг | Что происходит |
|---|---|
| 1. Старт реплики | `@EventListener(ApplicationReadyEvent)` в `TriggerScheduler.onReady()`. |
| 2. Попытка стать лидером | `leaderElection.tryAcquire(cronKey)`. |
| 3a. Стали лидером | `listEnabledScheduled().forEach { schedule(it) }` — как сейчас. |
| 3b. Не стали | `taskScheduler.scheduleAtFixedRate(::tryBecomeLeader, 30s)`. |
| 4. Cron сработал у лидера | `runEnqueueService.enqueue(...)` → run попадает в общую очередь, исполнить может любая реплика. |
| 5. Лидер умер | Postgres-сессия закрылась → advisory lock освобождён → следующая реплика подхватит на шаге 3b. |

Возможный провал одного cron-тика во время failover'а — допустим (минута
задержки). Если бизнес-критично — можно добавить «catch-up» при становлении
лидером (сравнить `now()` с `last_fired_at` на triggers — но это уже не входит
в minimum).

---

## 7. Graceful shutdown

```kotlin
@PreDestroy
fun shutdown() {
    shuttingDown = true              // RunWorker.tick() сразу выходит
    val deadline = System.currentTimeMillis() + 30_000
    while (inflight.isNotEmpty() && System.currentTimeMillis() < deadline) {
        Thread.sleep(500)
    }
    // те, что не успели — возвращаем в очередь
    if (inflight.isNotEmpty()) {
        val n = leases.releaseInFlight(nodeIdentity.nodeId)
        log.warn("Released {} in-flight runs back to queued on shutdown", n)
    }
}
```

`releaseInFlight(nodeId)`:
```sql
UPDATE workflow_run
SET status='queued', lease_owner=NULL, lease_until=NULL
WHERE status='running' AND lease_owner=:nodeId;
```

При `kill -9` `@PreDestroy` не отрабатывает — `RunJanitor` через ≤ 30s после
`lease_until` приберётся.

---

## 8. Деплой

### 8.1 `deploy/docker-compose.prod.yml`

Изменения:

1. Удалить строку `container_name: kursach-backend` (compose v2 не разрешает
   именованный контейнер при `--scale > 1`).
2. Healthcheck уже есть и подходит.
3. Запуск: `docker compose -f docker-compose.prod.yml up -d --scale backend=3`.

### 8.2 `frontend/nginx.conf`

Не меняется. `proxy_pass http://backend:8080` использует embedded Docker DNS,
который возвращает один из IP реплик round-robin'ом на каждом DNS-запросе.
Sticky session для WS **не нужны** благодаря LISTEN/NOTIFY-мосту.

### 8.3 Локальная разработка

`backend/docker-compose.yml`: рядом с одиночным `backend` добавить блок-пример
в комментарии о том, что можно запустить `docker compose up --scale backend=2`
для smoke-теста распределённости.

### 8.4 Документация

`README.md`: новый раздел «🌐 Horizontal scaling» с:

- ссылкой на этот spec;
- командой `--scale backend=N`;
- описанием at-least-once семантики и связанного ограничения для HTTP-нод;
- SQL-снипетом для просмотра очереди: `SELECT id, status, attempt, lease_owner FROM workflow_run WHERE status IN ('queued','running');`.

---

## 9. Тесты

Минимум, ради «правда работает»:

### 9.1 Unit (без Spring)

- `RunLeaseRepository.claimNext` с testcontainers Postgres:
  - один заклеймленный run не клеймится повторно тем же узлом (`status='running'`
    уже).
  - два параллельных вызова `claimNext` с разными `nodeId` на двух транзакциях
    возвращают разные `runId` (или null для второго при единственном queued).
- `RunLeaseRepository.heartbeat`:
  - возвращает true когда lease наш и `running`;
  - возвращает false если `lease_owner` другой (защита от race с janitor).
- `RunLeaseRepository.reclaimExpired`:
  - просроченный run с `attempt < maxAttempts` уходит в `queued`,
    `lease_*` зануляется;
  - просроченный run с `attempt >= maxAttempts` уходит в `failed` с
    `finished_at`.
- `LeaderElection.tryAcquire` через два разных `Connection`: первый — true,
  второй — false; после `connection.close()` первого — третья попытка снова
  true.

### 9.2 Integration (`@SpringBootTest` + testcontainer Postgres)

- **Распределение**: два `RunWorker`-инстанса в одном Spring-контексте, разные
  `nodeId`. Enqueue 5 runs. Через polling-цикл оба воркера разбирают; в итоге
  все 5 в `success`, и `attempt = 1` у каждого.
- **Failover**: enqueue run; ждём `status='running'`; вручную выставляем
  `lease_until = now() - '1s'` через JDBC; через janitor-tick — run возвращается
  в `queued`; следующий tick одного из воркеров его подхватывает; run
  завершается с `attempt = 2`.
- **Cron leader**: два инстанса `TriggerScheduler` в одном контексте с
  моком `dataSource` либо двумя выделенными pgjdbc-коннектами — только один
  становится лидером; после `connection.close()` второй подхватывает.
- **WS-bridge**: один `PgNotifyBroadcaster` публикует, другой (в том же тесте)
  через mock `SimpMessagingTemplate` ловит и проверяет destination+payload.

### 9.3 Manual smoke (в README как чек-лист)

1. `docker compose up -d --scale backend=2`
2. Открыть UI в двух табах. Запустить пайплайн с Python-нодой (≥ 30s).
3. Live-апдейты идут в обоих табах.
4. `docker kill <одна из реплик>` посреди исполнения.
5. Через ~30s run завершается на оставшейся реплике (видно по `attempt=2`).
6. `SELECT id, status, attempt, lease_owner FROM workflow_run ORDER BY id DESC LIMIT 5;` — состояние читаемо.

---

## 10. Граничные случаи и риски

| Риск | Митигация |
|---|---|
| At-least-once → HTTP-нода может вызваться дважды. | Известное ограничение; задокументировано в README. План B (idempotency-ключи на ноды) — отдельный тикет, не часть этого дизайна. |
| Postgres NOTIFY payload limit ~8000 байт. | Шлём только destination + лёгкий JSON. Если payload крупный — кладём в БД и шлём указатель. |
| Heartbeat-частота на БД. | 10s × N инстансов × concurrent runs. При N=3, K=10 — ~3 UPS, пренебрежимо. |
| Cron-лидер «висит» (процесс жив, но JVM застрял). | `tcpKeepAlive=true` + короткие keepalive-интервалы на лидерском Connection; для жёстких сценариев — мониторинг `pg_locks`. Для текущей задачи — достаточно дефолтного поведения. |
| `--scale N` ломается из-за `container_name`. | Убираем `container_name: kursach-backend` (см. §8). |
| Несколько backend-инстансов конкурируют за один docker-proxy и могут перегрузить хост. | `max-runs-per-node` ограничивает concurrency на реплику; общая нагрузка = N × max-runs-per-node. Документируем в README. |
| Общий пул для драйверов и нод может задедлочиться (драйвер блокирует тред на `join()`). | Разделяем на `runDispatcherPool` (драйверы) и `workflowExecutor` (ноды). Подробно в §5.10. |
| Liquibase-миграция при старте 3-х реплик одновременно. | Liquibase сам берёт advisory lock на `databasechangeloglock`; реплики сериализуются. Работает «из коробки». |
| LISTEN-соединение разорвалось. | В `PgNotifyBroadcaster` — reconnect loop с экспоненциальным backoff'ом (1s, 2s, 5s, 10s, capped). При reconnect повторно делает `LISTEN`. |

---

## 11. План раскатки

1. PR: миграция + новые компоненты + изменения в `RunEnqueueService` и `WorkflowExecutionService`. Все тесты green в CI.
2. Раскатка в dev: `--scale backend=2`, прогнать smoke (§9.3).
3. Раскатка в prod: `--scale backend=3` (или сколько решит пользователь).
4. Открытый план B (если возникнет потребность): idempotency-ключи для HTTP-нод; node-level distribution.

---

## 12. Open questions (минимальные)

Все важные допущения уже зафиксированы; перепроверка при реализации:

- **Найти все места `messaging.convertAndSend(...)`** в текущем коде — заменить
  на `pgNotifyBroadcaster.publish(...)`. (Сейчас точно есть в
  `GraphBroadcastListener`; возможны другие — проверить grep'ом во время
  имплементации.)
- **`workflow_run.started_at`** при retry: `COALESCE(started_at, now())` —
  оставляем время первого старта или перезаписываем? В этом дизайне —
  `COALESCE`, чтобы `started_at` отражал первый запуск. Если пользователю
  важно видеть «текущая попытка стартовала тогда-то» — есть `last_heartbeat`
  + `attempt`.
