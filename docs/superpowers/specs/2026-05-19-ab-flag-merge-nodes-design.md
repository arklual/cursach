# A/B Split + Feature Flag + Merge nodes — Design

**Date:** 2026-05-19
**Status:** approved (brainstorm), pending implementation plan
**Scope:** add real branching primitives to FluxPilot workflow engine

---

## 1. Goal

Дать пользователю возможность строить графы с реальным ветвлением:

- **Split / A·B / Feature Flag** — одна нода (`branch.split`), которая разделяет
  поток элементов или выбирает одну ветку, по разным стратегиям распределения
  пользователей.
- **Merge** — нода (`branch.merge`), которая склеивает несколько веток обратно
  в один поток с тэгом источника, чтобы downstream-аналитика могла различать
  варианты.

Сейчас на фронте уже есть `NodeKind = 'ab' | 'join'` со заглушечными полями
(`variants`, `randomization`), но в палитре их нет и на бэке нет executor'а —
маппер ремапит их в `dataflow.foreach` (passthrough). Этот документ описывает,
как сделать ветвление реальным.

---

## 2. Architecture (high level)

Одна нода `branch.split` (UI label: «Split / A·B / Feature Flag») и одна нода
`branch.merge` (UI label: «Merge»). Обе — обычные `NodeExecutor` на бэке, но
Split взаимодействует с executor'ом через **контракт `edge.variant`**:

```
                 ┌──── edge.variant="A" ──→ [node A]──┐
[upstream] ────→ │Split│                              ├──→ [Merge] ──→ [downstream]
                 └──── edge.variant="B" ──→ [node B]──┘
```

Два режима поведения у Split:

- **split-mode** — разделить поток. Выход:
  `{ mode:"split", variants:{A:[...], B:[...]}, meta:{...} }`. Executor по
  `edge.variant` отдаёт каждой downstream-ноде только её подмножество.
- **pick-mode** — выбрать один вариант (как if/else). Выход:
  `{ mode:"pick", chosen:"A", payload:<вход>, meta:{...} }`. Downstream-ноды
  на не-выбранных ветках помечаются `skipped`, и skip распространяется
  транзитивно (Merge принимает только активную ветку).

Merge — обычная нода с несколькими входами: конкат массивов с тэгом
`_variant`, skipped-входы игнорируются.

Backend type strings: `branch.split`, `branch.merge`. На фронте `NodeKind`
остаётся `'ab' | 'join'`, маппер перестаёт ремапить их в `dataflow.foreach`.

---

## 3. Split node — contract

**Backend type:** `branch.split`

### Config (JSON)

```json
{
  "mode": "split" | "pick",
  "strategy": "random" | "hash" | "modulo" | "attribute" | "percentage" | "stratified",
  "variants": [
    { "key": "A", "label": "Control",   "weight": 50 },
    { "key": "B", "label": "Treatment", "weight": 50 }
  ],

  "userIdField": "user_id",         // hash / modulo / stratified
  "salt": "exp-checkout-2026",      // hash sticky; fallback — nodeId
  "seed": 12345,                    // random (опц., для повторяемости в тестах)

  "percentage": 20,                 // percentage (одна ветка): % в variants[0]

  "rules": [                        // attribute
    { "variant": "A", "field": "country", "op": "in", "value": ["RU","BY"] },
    { "variant": "A", "field": "plan",    "op": "eq", "value": "pro" }
  ],
  "defaultVariant": "B",

  "stratifyBy": "country"           // stratified
}
```

### Strategies

| Strategy     | Per-item решение                                              | Sticky? |
|--------------|---------------------------------------------------------------|---------|
| `random`     | взвешенный бросок монеты, `seed` опц.                          | нет     |
| `hash`       | `crc32(userId + salt) → bucket → variant` (по весам)           | да (каноничный A/B) |
| `modulo`     | `hash(userId) % sum(weights)`                                  | да      |
| `attribute`  | первое подходящее правило в `rules`; иначе `defaultVariant`    | да (по атрибутам) |
| `percentage` | как `hash`, ровно 2 ветки (`on`/`off`), один `percentage`      | да      |
| `stratified` | `hash` внутри страты `stratifyBy` отдельно                     | да внутри страты |

### Input

Массив объектов. Если на входе envelope от executor'а
(`{runInput, inputs:{dep:...}}`) — извлекаем как
`resolveStreamInput` в `DataflowNodeExecutors.kt`. Если вход — не массив,
заворачиваем в одноэлементный массив.

### Output

**split-mode:**

```json
{
  "mode": "split",
  "variants": { "A": [...], "B": [...] },
  "meta": { "strategy": "hash", "totals": { "A": 1043, "B": 1057 } }
}
```

**pick-mode:**

```json
{ "mode": "pick", "chosen": "A", "payload": <исходный вход>, "meta": {...} }
```

Каждому элементу-объекту в `variants[k]` дописывается поле `_variant: "A"` —
это делает downstream-аналитику и Merge тривиальными. Элементы-примитивы
(строки/числа) проходят без модификации; тэг им может проставить Merge
по `edge.variant`.

### Config validation (внутри executor'а)

- `sum(weights) > 0`.
- `attribute`: каждый `variant` в `rules[]` должен присутствовать в
  `variants[].key`; `defaultVariant` — тоже.
- `percentage`: ровно 2 варианта; `0 ≤ percentage ≤ 100`.
- `hash`/`modulo`/`stratified`: `userIdField` непустой;
  `stratified` — `stratifyBy` непустой.

Нарушение валидации → executor бросает `IllegalArgumentException`, NodeRun
помечается failed (как у других executor'ов).

---

## 4. Merge node — contract

**Backend type:** `branch.merge`

### Config (JSON)

```json
{
  "tagField": "_variant",
  "preserveExistingTag": true,
  "sourceVariants": {              // опционально: явная карта upstream-id → variant
    "node-abc": "A",
    "node-def": "B"
  }
}
```

В большинстве случаев `sourceVariants` не нужен — Merge использует
`edge.variant` входящего ребра.

### Behaviour

1. Из `inputs.<depId>` собираются все upstream-выходы.
2. Для каждого входа определяется `variant` в порядке приоритета:
   1. `sourceVariants[depId]`, иначе
   2. `edge.variant` входящего ребра (executor прокидывает его в input —
      см. §5), иначе
   3. `null` (тэг не дописывается).

   Замечание: после §5 executor уже распаковывает Split-pick-envelope в
   `payload` до того, как Merge их увидит. Так что Merge никогда не
   получает `{mode:"pick", chosen:...}` напрямую — `chosen` достаётся
   через `edge.variant`, который к моменту Merge всегда совпадает с
   выбранной веткой (другие edges помечены skipped).
3. Если вход — массив: каждому элементу записывается `tagField = variant`,
   с учётом `preserveExistingTag`.
4. Подмножество от Split в split-mode извлекается уже executor'ом
   через `resolveSplitOutputForEdge` (§5) — Merge видит плоский массив
   subset'а, как любой другой downstream-узел. Прямая связка «Split→Merge»
   и составная «Split→несколько нод→Merge» обрабатываются одинаково.
5. Skipped-входы игнорируются.
6. Конкатенирует всё в один плоский массив.

### Output

Плоский массив объектов с проставленным `_variant`.

---

## 5. Executor changes (`WorkflowExecutionService`)

### Step 1 — добавить `variant` в DTO связи

```kotlin
// api/dto/WorkflowDtos.kt
data class Connection(
    val id: String, val source: String, val target: String,
    val sourceHandle: String? = null, val targetHandle: String? = null,
    val variant: String? = null,           // NEW
)

// workflow/model/GraphSkeleton.kt
data class ConnectionSkeleton(
    val id: String, val source: String, val target: String,
    val sourceHandle: String? = null, val targetHandle: String? = null,
    val variant: String? = null,           // NEW
)
```

Поле опциональное, обратно совместимо со старыми графами (`null` = без тэга).

### Step 2 — `buildNodeInput` принимает рёбра, а не только ids

```kotlin
private fun buildNodeInput(
    runInputJson: String?,
    incomingEdges: List<ConnectionSkeleton>,
    outputs: Map<String, JsonNode>,
    skipped: Set<String>,
): JsonNode {
    val root = objectMapper.createObjectNode()
    root.set<JsonNode>("runInput", parseRunInput(runInputJson))
    val inputs = objectMapper.createObjectNode()
    for (edge in incomingEdges) {
        if (skipped.contains(edge.source)) continue
        val upstreamOutput = outputs[edge.source] ?: NullNode.instance
        val delivered = resolveSplitOutputForEdge(upstreamOutput, edge.variant)
        inputs.set<JsonNode>(edge.source, delivered)
    }
    root.set<JsonNode>("inputs", inputs)
    return root
}

private fun resolveSplitOutputForEdge(upstream: JsonNode, edgeVariant: String?): JsonNode {
    if (!upstream.isObject) return upstream
    val mode = upstream.get("mode")?.asText() ?: return upstream
    return when (mode) {
        "split" -> {
            val variants = upstream.get("variants") ?: return upstream
            if (edgeVariant != null && variants.has(edgeVariant)) variants.get(edgeVariant)
            else upstream
        }
        "pick" -> upstream.get("payload") ?: upstream
        else  -> upstream
    }
}
```

### Step 3 — skip-логика в основном цикле

```kotlin
val skipped = ConcurrentHashMap.newKeySet<String>()

val f = ready.thenApplyAsync({
    val incoming = incomingEdgesByTarget[nodeId].orEmpty()
    val liveIncoming = incoming.filter { edge ->
        if (skipped.contains(edge.source)) return@filter false
        val up = outputs[edge.source]
        !(up != null && up.isObject &&
          up.get("mode")?.asText() == "pick" &&
          edge.variant != null &&
          up.get("chosen")?.asText() != edge.variant)
    }

    if (incoming.isNotEmpty() && liveIncoming.isEmpty()) {
        skipped.add(nodeId)
        nodeRuns.markSkipped(nodeRunIds.getValue(nodeId), "Branch not selected")
        return@thenApplyAsync NullNode.instance as JsonNode
    }

    val inputNode = buildNodeInput(run.inputJson, liveIncoming, outputs, skipped)
    // ... остальной execute-путь как сейчас
}, workflowExecutor)
```

### Step 4 — финальный статус run'а

skipped-ноды не считаются ошибками. Текущая логика `markSkipped("Dependency failed")`
для нод, упавших из-за upstream-ошибки, остаётся; новая ветка
`markSkipped("Branch not selected")` различает причины. Merge работает как
or-join автоматически: если хотя бы одно incoming-edge не skipped — Merge
выполняется на оставшихся входах.

**Объём изменений:** ~50–80 строк в `WorkflowExecutionService.kt`, +1 поле в
двух DTO, плюс сериализация `variant` при сохранении графа.

---

## 6. Graph validation

Расширения `WorkflowValidatorService` (фронт) + параллельные проверки на бэке
в `WorkflowService` при сохранении ревизии:

| # | Правило | Severity |
|---|---|---|
| 1 | Сумма `weights` > 0 для Split | error |
| 2 | Каждое исходящее ребро Split имеет `variant`, и он есть в `variants[].key` | error |
| 3 | Два исходящих ребра Split с одинаковым `variant` | warning |
| 4 | В `variants[]` есть key, для которого нет исходящего ребра | warning |
| 5 | В pick-mode ветки сходятся вне Merge (на ноде, чувствительной к skipped) | warning |
| 6 | Merge с одним входом | warning |
| 7 | `userIdField` для hash/modulo/stratified/attribute — непустой; `stratifyBy` для stratified — непустой | error |

Все проверки — в один проход по графу. Бэк-валидация при сохранении графа
возвращает 4xx (как уже сделано для других несостыковок).

---

## 7. Frontend changes

### Mapper (`workflow.mapper.ts`)

- Убрать «хак» в `toBackendType`: `ab → branch.split`, `join → branch.merge`.
- Симметрично в `fromBackendType`: `branch.split → {kind:'ab'}`,
  `branch.merge → {kind:'join'}`.
- Сохранить совместимость со старыми графами через `__originalKind`
  (где `ab`/`join` лежат как `dataflow.foreach`) — оставить распознавание.
- Edge mapper: `data.variant ↔ connection.variant`.

### Palette (`palette.component.ts`)

Новая категория:

```ts
{
  id: 'branches', name: 'Ветки', color: 'var(--info, #f472b6)',
  items: [
    { id: 'ab',   label: 'Split / A·B', kind: 'ab',   iconPath: icons.split },
    { id: 'join', label: 'Merge',       kind: 'join', iconPath: icons.merge },
  ],
}
```

Новые SVG-иконки `split`, `merge`.

### Split inspector

- Switch `mode`: «Split поток» / «Pick one branch».
- Select `strategy` (6 пунктов).
- Динамический form по стратегии:
  - `random` → `seed`;
  - `hash`/`modulo`/`stratified` → `userIdField`, `salt` (для hash);
  - `attribute` → редактор `rules[]` (variant, field, op, value);
  - `percentage` → слайдер 0–100.
- Editable список `variants` (key, label, weight) с drag-sort и кнопкой «+».

### Merge inspector

- `tagField` (default `_variant`), `preserveExistingTag` checkbox.
- Read-only таблица «источники → variant», заполняется из входящих рёбер.

### Node на канвасе (`workflow-node.component.ts`)

- Для `kind='ab'` — несколько выходных хэндлов (по одному на variant,
  с цветной точкой и подписью). Требует от `workflow-canvas` поддержки
  нескольких source-handle'ов — проверить, есть ли уже; если нет — это
  самое объёмное изменение во фронте.
- При создании ребра из конкретного хэндла Split → автоматически
  проставляем `edge.data.variant = handle.key`.

### `workflow.service.ts`

- Шаблон `ab`: `{mode:'split', strategy:'random', variants:[{key:'A',label:'Control',weight:50},{key:'B',label:'Treatment',weight:50}]}`.
- Шаблон `join`: пустой config.

**Объём:** ~150–250 строк нового кода + правки в палитре, инспекторе, маппере, узле.

---

## 8. Backwards compatibility

- Старые сохранённые `ab`/`join` лежат на бэке как `type: "dataflow.foreach"`
  с меткой `__originalKind`. `fromBackendType` уже это распознаёт и
  восстанавливает kind. Эти графы продолжают работать как passthrough
  (поведение не меняется), но Split-логика к ним не применится, пока
  пользователь не пересохранит ноду через инспектор — тогда type перепишется
  в `branch.split`.
- Не пишем разовый бэкфилл — низкая ценность, лишний риск.
- Старые рёбра без `variant` — `null`, executor отдаёт upstream-output как
  раньше.
- Миграция БД не требуется. `Connection.variant` хранится внутри JSON-графа
  (`graphSkeletonJson` в `workflow_revision`), отдельной колонки нет.

---

## 9. Testing

### Backend

- `BranchSplitNodeExecutorTest` — по стратегии: random (с `seed` →
  детерминированный), hash (sticky между прогонами), modulo, attribute
  (правила и default), percentage, stratified (баланс внутри страт).
  `seed` фиксированный.
- `BranchMergeNodeExecutorTest` — concat, тэг `_variant` из
  edge/sourceVariants/pick, skipped-входы, `preserveExistingTag`.
- `WorkflowExecutionServiceBranchTest` — интеграционный:
  - Split(split)→A→Merge,
  - Split(split)→A+B→Merge,
  - Split(pick)→A+B→Merge (одна ветка skipped, Merge возвращает только активную),
  - старый граф с `dataflow.foreach`-placeholder'ом запускается без падений.

### Frontend

- `workflow.mapper.spec.ts` — round-trip для `branch.split`/`branch.merge`
  с `edge.variant`.
- `workflow-validator.service.spec.ts` — каждое правило из §6.
- Юнит-тест на multi-handle Split-ноды (если добавляем поддержку
  мульти-хэндлов).

---

## 10. Scope estimate

- **Backend:** 2 новых executor'а (~200 строк), правки в
  `WorkflowExecutionService` (~80), +1 поле в 2 DTO, +валидация в
  `WorkflowService` (~50). Тесты ~400.
- **Frontend:** палитра+иконки (~40), маппер (~30), инспектор Split (~200),
  инспектор Merge (~50), узел с мульти-хэндлами (~100). Тесты ~200.

Итого ~1300–1400 строк включая тесты.
