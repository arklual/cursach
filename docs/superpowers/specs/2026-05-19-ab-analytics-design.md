# A/B-эксперименты: аналитика per-workflow

**Дата:** 2026-05-19
**Автор:** brainstorm session
**Статус:** утверждён, готов к плану реализации
**Связанный документ:** [2026-05-19-ab-flag-merge-nodes-design.md](2026-05-19-ab-flag-merge-nodes-design.md)

## Контекст

В проекте уже есть Split/Merge ноды (`ab` / `join`), edge.variant сохраняется и на фронте, и в `ConnectionSkeleton`. Запуски пишутся в `workflow_run` и `node_run` (`output_json` — JSONB). Аналитических эндпоинтов и страниц ещё нет. На фронте `chart.js@4.4.6` стоит в `package.json`, но не используется. Маршруты приложения плоские (`workflows-list`, `workflow/:id`, `**`).

## Цель MVP

Дать владельцу workflow быстрый ответ на два вопроса по любой ab-ноде в его graph'е:

1. **Сколько трафика реально пошло по каждому варианту** (сравнение с `weights` из config).
2. **Какой вариант конвертит лучше** (доля workflow runs, завершившихся `success`), с оценкой статистической значимости.

Без time-range фильтров, без polling, без отдельной страницы. Чистый MVP — embedded tab.

## Решения, принятые при брейнсторме

| Вопрос | Решение |
|---|---|
| Scope | per-workflow, вкладка в редакторе |
| Метрики | traffic distribution + conversion (run.status='success') + p-value |
| Конверсия | `count(success runs) / count(runs)` per variant, без выбора target-ноды |
| Placement | новая вкладка в нижней панели редактора рядом с «Логи»/«Запуски» |
| Storage | без миграций; variant читается из `node_run.output_json` ab-ноды |
| Stat test | two-proportion z-test против baseline (первый variant в config) |
| Charts | CSS-bars; chart.js не подключаем |
| Auto-refresh | только ручной ↻ (без polling) |
| Multi ab-node | dropdown «Эксперимент» в шапке вкладки |
| Pick vs split | conversion считается только для pick; для split — только traffic |

## Архитектура

Backend — один read-only сервис + один endpoint, без миграций.
Frontend — один Angular standalone-компонент, регистрируется как третья вкладка в нижней панели редактора.

```
┌─ AnalyticsPanelComponent (frontend) ─┐
│  dropdown experiment | refresh ↻    │
│  Traffic bars                       │
│  Conversion table (pick only)       │
└──────────────┬───────────────────────┘
               │ GET /api/workflows/{id}/ab-analytics?abNodeId=...
               ▼
┌─ AbAnalyticsController ─┐
│ валидация + 4xx коды    │
└─────────┬───────────────┘
          ▼
┌─ AbAnalyticsService ────────────────────────────────┐
│ 1. WorkflowRepository.findById → проверка ab-node   │
│ 2. JOIN workflow_run + node_run (выбранной ab-ноды) │
│ 3. парсим output_json → variant per run             │
│ 4. агрегируем + StatTest                            │
└─────────────────────────────────────────────────────┘
```

## Data flow

Два запроса от сервиса:

**(1) Основной — runs с известным variant (для агрегации):**

```sql
SELECT
  wr.id            AS run_id,
  wr.status        AS run_status,
  nr.output_json   AS ab_output
FROM workflow_run wr
JOIN node_run nr
  ON nr.workflow_run_id = wr.id
 AND nr.node_id = :abNodeId
WHERE wr.workflow_id = :workflowId
  AND wr.status IN ('success', 'failed')
  AND nr.status = 'success'
```

**(2) Счётчик excluded — completed runs БЕЗ успешного `node_run` у ab-ноды:**

```sql
SELECT COUNT(*)
FROM workflow_run wr
WHERE wr.workflow_id = :workflowId
  AND wr.status IN ('success', 'failed')
  AND NOT EXISTS (
    SELECT 1 FROM node_run nr
    WHERE nr.workflow_run_id = wr.id
      AND nr.node_id = :abNodeId
      AND nr.status = 'success'
  )
```

Учитываем только завершённые runs (`status IN ('success', 'failed')`). `queued`/`running` исключаем — они ещё не дали результата.

Дальше в Kotlin парсим `ab_output` (`ObjectMapper`):

- **pick-mode**: `ab_output.meta.chosen` — строка с key варианта. Группируем runs по этому ключу.
- **split-mode**: `ab_output.variants[key]` — массив элементов данных. Traffic для каждого варианта = сумма `length` по всем runs.

Runs с невалидным `ab_output` (нет `meta.chosen` для pick или `variants` для split, либо невалидный JSON) добавляются к счётчику `excludedNoVariant` уже на этапе парсинга — итоговое значение `excludedNoVariant = COUNT(2) + (runs из (1) с невалидным output)`.

## API контракт

### Endpoint

```
GET /api/workflows/{workflowId}/ab-analytics?abNodeId={nodeId}
```

### Response

```json
{
  "abNodeId": "n-abc12",
  "mode": "pick",
  "totalRuns": 300,
  "excludedNoVariant": 0,
  "computedAt": "2026-05-19T13:42:18Z",
  "variants": [
    {
      "key": "A",
      "label": "Control",
      "color": "#84cc16",
      "weight": 50,
      "runs": 159,
      "trafficCount": 159,
      "trafficPct": 53.0,
      "conversions": 108,
      "conversionPct": 67.9,
      "ciLow": 60.6,
      "ciHigh": 75.2,
      "liftVsBaseline": null,
      "pValue": null,
      "isBaseline": true,
      "isSignificant": false
    },
    {
      "key": "B",
      "label": "Treatment",
      "color": "#3b82f6",
      "weight": 50,
      "runs": 141,
      "trafficCount": 141,
      "trafficPct": 47.0,
      "conversions": 104,
      "conversionPct": 73.8,
      "ciLow": 66.5,
      "ciHigh": 81.0,
      "liftVsBaseline": 5.9,
      "pValue": 0.0123,
      "isBaseline": false,
      "isSignificant": true
    }
  ],
  "warnings": []
}
```

### Особенности

- `mode: "split"` → `conversions`, `conversionPct`, `ciLow`, `ciHigh`, `liftVsBaseline`, `pValue`, `isSignificant` — все `null`. UI скрывает блок Conversion и показывает подсказку «Conversion недоступна для split-mode».
- `isBaseline=true` для первого варианта в `config.variants`.
- `isSignificant=true` только если `pValue < 0.05` И `runs ≥ 30` И baseline.runs ≥ 30.
- `warnings`: массив human-readable строк. Например: `"Слишком мало наблюдений (<30) — p-value неустойчив"` или `"Variant 'C' имеет 0 runs"`.

### Ошибки

| Условие | Код | Body |
|---|---|---|
| `workflowId` не существует | 404 | `{ "error": "workflow not found" }` |
| `abNodeId` не существует в workflow | 404 | `{ "error": "node not found in workflow" }` |
| `abNodeId` указывает на ноду с `kind != "ab"` | 400 | `{ "error": "node is not an A/B split" }` |
| `abNodeId` отсутствует в query | 400 | `{ "error": "abNodeId is required" }` |

## Статистика

### Two-proportion z-test (формула)

Pooled proportion:
```
p̂ = (x_b + x_v) / (n_b + n_v)
SE = sqrt(p̂(1 - p̂) · (1/n_b + 1/n_v))
z  = (p_v - p_b) / SE
p-value = 2 · (1 - Φ(|z|))
```

`Φ` — CDF стандартного нормального распределения. Реализуем через approximation Abramowitz & Stegun 26.2.17 (точность ~7.5e-8). Никакой стат-библиотеки не тащим — функция помещается в ~30 строк.

### Wald CI (95%)

```
p ± 1.96 · sqrt(p(1 - p) / n)
```

Клипаем к `[0, 100]` в процентах.

### Lift

```
liftVsBaseline = conversionPct_variant - conversionPct_baseline   (процентные пункты)
```

Возвращаем `null` для baseline.

## Компоненты

### Backend (Kotlin)

| Файл | Назначение |
|---|---|
| `api/AbAnalyticsController.kt` | endpoint, валидация, error mapping |
| `analytics/AbAnalyticsService.kt` | основная логика агрегации |
| `analytics/AbAnalyticsDtos.kt` | request/response DTO |
| `analytics/AbAnalyticsRepository.kt` | один query method `findRunsForAbNode(workflowId, nodeId)` |
| `analytics/StatTest.kt` | чистые функции: `twoProportionZ`, `wilsonCi` (или `waldCi`), `normalCdf` |

`AbAnalyticsService` зависит от: `WorkflowRepository` (проверка существования и kind), `AbAnalyticsRepository` (raw rows), `ObjectMapper`.

### Frontend (Angular)

| Файл | Назначение |
|---|---|
| `components/analytics-panel/analytics-panel.component.ts` | сам компонент панели |
| `core/api/analytics.api.ts` | fetch-обёртка `getAbAnalytics(workflowId, abNodeId)` |

Интеграция в `pages/workflow-editor/workflow-editor.component.ts`: добавить третью вкладку в нижнюю tab-bar рядом с «Логи» и «Запуски» (см. поиск `'logs' | 'runs'` для аналога). При смене активного workflow перезапрашивать список ab-нод и autoselect, если нода одна.

## UI скетч

```
┌─ Canvas ───────────────────────────────────────┐
│   [Trigger] → [A/B Fork] →→ [HTTP] → [Code]    │
└────────────────────────────────────────────────┘

[ Логи ] [ Запуски ] [ Аналитика ◀ новая ]
┌──────────────────────────────────────────────────────┐
│ Experiment: [A/B Fork ▾]              All time    ↻ │
│                                                      │
│ Traffic distribution (300 runs)                      │
│ ● A  53% (159)  expected 50%                         │
│ ● B  47% (141)  expected 50%                         │
│ [█████████████ A │ B ███████████]                    │
│                                                      │
│ Conversion (run-success)                             │
│ Variant   Runs   Conv   95% CI       Lift   p       │
│ A         159    67.9%  60.6–75.2    —      —       │
│ B         141    73.8%  66.5–81.0    +5.9pp 0.012 ✰ │
└──────────────────────────────────────────────────────┘
```

Бейдж `✰` рисуется только если `isSignificant=true`. Цвета точек берутся из `variantPalette` фронта (тот же массив, что и в `workflow-canvas.component.ts`) — консистентно с раскраской рёбер на канвасе.

## Edge cases

| Сценарий | Поведение |
|---|---|
| 0 runs | возвращаем variants со всеми нулями; UI рисует empty-state «Запусков с этим экспериментом ещё не было» |
| Variant в runs есть, но отсутствует в текущем config | добавляем строку с `label = key`, `color = серый`, `warning` в массиве |
| Variant в config есть, но 0 runs | строка с нулями; CI/lift/p — null |
| `runs < 30` хотя бы у одного из сравниваемых | `isSignificant=false`, warning «недостаточная выборка» |
| Невалидный `output_json` у ab-ноды | run попадает в `excludedNoVariant`, не ломает агрегацию |
| Несколько ab-нод в workflow | dropdown «Эксперимент» (kind='ab'); aналитика считается строго по выбранной |

## Тесты

### Backend (TDD)

1. **`StatTestTest`** — табличные кейсы:
   - z-test для известных значений (например, `(50/100, 60/100) → z ≈ -1.43, p ≈ 0.153`).
   - `normalCdf(0) ≈ 0.5`, `normalCdf(1.96) ≈ 0.975`, `normalCdf(-1.96) ≈ 0.025`.
   - Wald CI для `(p=0.5, n=100) → [0.402, 0.598]`.

2. **`AbAnalyticsServiceTest`** (Testcontainers, по образцу `WorkflowExecutionServiceBranchTest`):
   - pick-mode, 2 variants, 100 runs (60 A / 40 B), 36 success в A и 28 success в B → корректные traffic/conversion и p-value.
   - split-mode → `conversions = null`, traffic считается по сумме длин массивов.
   - 0 runs → пустой ответ, `totalRuns=0`.
   - Run без node_run у ab-ноды → попадает в `excludedNoVariant`.
   - Variant удалён из config, но есть в исторических runs → warning в ответе.

3. **`AbAnalyticsControllerTest`** — slice test (MockMvc):
   - 200 OK happy path.
   - 404 на несуществующий workflow.
   - 400 на ноду не-ab.
   - 400 на отсутствующий `abNodeId`.

### Frontend

- `analytics-panel.component.spec.ts` — smoke:
  - Рендерит traffic bars из мокового ответа.
  - При `mode='split'` скрывает блок Conversion.
  - При 0 runs показывает empty-state.

## Out of MVP

| Фича | Почему не сейчас |
|---|---|
| Time-range фильтр | usable MVP без него; «All time ▾» в UI — пока заглушка с одним пунктом |
| Polling auto-refresh | при коротких сессиях достаточно ручного ↻; добавим, когда понадобится |
| chart.js | CSS-баров хватает для двух блоков, не тащим бандл |
| Cross-workflow дашборд | требует отдельного маршрута и агрегатов по всем workflows |
| chi-square для >2 вариантов | для MVP попарные z-tests к baseline (корректно для 2; для 3-4 — приемлемо с warning) |
| Bonferroni-correction | preview-функция, добавим вместе с >2-вариантной поддержкой |
| Persist target node / explicit conversion | сейчас «success run» хватает; кастомные определения — позже |
| Backfill старых runs | новые эксперименты пишутся «как есть»; миграции не нужны |
