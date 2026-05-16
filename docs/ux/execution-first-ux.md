# 🎯 UX-ребрендинг: От аналитики к визуальному исполнению

## Проблема текущего UX

**Сейчас:**
- Акцент на A/B-тестировании и статистике
- Непонятно, как данные проходят через граф
- Нет визуальной обратной связи при исполнении
- Сложно отладить workflow

**Цель (как в n8n):**
- ✅ Видно, какая нода выполняется **прямо сейчас**
- ✅ Input/output каждой ноды **на виду**
- ✅ Анимация прохождения данных по связям
- ✅ Мгновенная обратная связь об ошибках
- ✅ Аналитика — вторична, исполнение — первично

---

## 🔴 Критические проблемы

### 1. Нет визуализации исполнения
**Сейчас:**
```
[Запуск] → [Ждём 15 сек] → [Результаты в логах]
```

**Как в n8n:**
```
[Запуск] → [Ноде 1 загорается зелёным] → [Данные текут по связи] → [Ноде 2 загорается] → [Готово]
```

### 2. Не видно input/output нод
**Сейчас:**
- Логи внизу экрана (мелко, неудобно)
- Нужно открывать модальное окно для деталей

**Как в n8n:**
- Клик на ноду → панель справа с JSON input/output
- Можно сравнить "до" и "после"

### 3. Нет анимации потока данных
**Сейчас:**
- Статичные связи
- Непонятно, куда пошли данные

**Как в n8n:**
- Анимированные стрелки (бегущие точки)
- Видно направление и факт передачи

### 4. Аналитика на первом месте
**Сейчас:**
- A/B Config в header
- Experiment Results modal
- Статистика в каждой ноде

**Как надо:**
- A/B — опционально (для 90% пользователей не нужно)
- Аналитика — отдельная вкладка/режим
- По умолчанию: исполнение и отладка

---

## ✅ Новый UX: Приоритеты

### P0 — Визуальное исполнение (критично)
1. **Подсветка активной ноды** — зелёная рамка при выполнении
2. **Анимация связей** — бегущие точки по стрелкам
3. **Input/Output панель** — справа при клике на ноду
4. **Статус выполнения** — иконка на ноде (⏳ → ✅ → ❌)

### P1 — Отладка (очень важно)
5. **Пошаговое исполнение** — кнопка "Step" для отладки
6. **Пауза/Продолжить** — контроль исполнения
7. **История исполнений** — список последних запусков
8. **Экспорт input/output** — скачать JSON

### P2 — Аналитика (вторично)
9. A/B-тестирование — скрыто в настройках ноды
10. Статистика — отдельная вкладка "Analytics"
11. Метрики — по запросу, не по умолчанию

---

## 🎨 Новый дизайн компонентов

### 1. Нода с статусом исполнения

**Состояния:**
```
┌─────────────────┐
│ 🟢 HTTP Request │  ← ✅ Успех
│                 │
│ 200 OK          │
│ 45ms            │
└─────────────────┘

┌─────────────────┐
│ 🟡 HTTP Request │  ← ⏳ Выполняется
│                 │
│ Отправка...     │
└─────────────────┘

┌─────────────────┐
│ 🔴 HTTP Request │  ← ❌ Ошибка
│                 │
│ 500 Error       │
│ 12ms            │
└─────────────────┘

┌─────────────────┐
│ ⚪ HTTP Request │  ← ⚪ Ожидание
│                 │
│ —               │
└─────────────────┘
```

### 2. Анимированные связи

**Спокойное состояние:**
```
[Ноде 1] ──────────▶ [Ноде 2]
```

**Передача данных:**
```
[Ноде 1] ──●───────▶ [Ноде 2]  ← ● бежит по связи
```

**Несколько пакетов:**
```
[Ноде 1] ──●───●───▶ [Ноде 2]  ← несколько точек
```

### 3. Панель исполнения (справа)

**Вкладки:**
```
[Execution] [Input/Output] [Analytics] [Settings]
```

**Execution вкладка:**
```
┌──────────────────────────────┐
│ ▶ Запустить  ⏸ Пауза  ⏹ Стоп │
├──────────────────────────────┤
│ Ход исполнения:              │
│                              │
│ ✅ Trigger (12:34:56)        │
│    └─ Output: { id: 1 }      │
│                              │
│ ⏳ HTTP Request (12:34:57)   │
│    └─ Sending...             │
│                              │
│ ⚪ Join (ожидание)           │
└──────────────────────────────┘
```

**Input/Output вкладка:**
```
┌──────────────────────────────┐
│ Input                        │
│ ┌──────────────────────────┐ │
│ │ {                        │ │
│ │   "id": 123,             │ │
│ │   "name": "test"         │ │
│ │ }                        │ │
│ └──────────────────────────┘ │
│                              │
│ Output                       │
│ ┌──────────────────────────┐ │
│ │ {                        │ │
│ │   "status": 200,         │ │
│ │   "data": {...}          │ │
│ │ }                        │ │
│ └──────────────────────────┘ │
│                              │
│ [📋 Copy] [📥 Download]     │
└──────────────────────────────┘
```

### 4. Header с режимом исполнения

**Режим редактора:**
```
← Назад | My Workflow ✏️ | 🟢 Готов | [💾] [▶ Запуск ▼]
```

**Режим исполнения:**
```
← Назад | My Workflow ✏️ | 🔴 Выполняется | [⏹ Стоп] [⏸ Пауза]
```

**Выпадающее меню запуска:**
```
▶ Запустить (1 прогон)
▶ Запустить с отладкой (пошагово)
▶ Запустить с моковыми данными
```

---

## 🔄 Поток исполнения (User Journey)

### Сценарий: Отладка workflow

**1. Пользователь создаёт workflow:**
```
Trigger → HTTP → Code → Join
```

**2. Нажимает "Запустить с отладкой":**
```
Header: 🔴 Выполняется | [⏹] [⏸]
```

**3. Наблюдает исполнение:**
```
Шаг 1: Trigger загорается зелёным ✅
       Связь анимируется (● бежит)
       Output: { event: "start" }

Шаг 2: HTTP загорается жёлтым ⏳
       Через 2 сек: зелёный ✅
       Output: { status: 200, data: {...} }

Шаг 3: Code загорается жёлтым ⏳
       Через 1 сек: зелёный ✅
       Output: { processed: true }

Шаг 4: Join загорается зелёным ✅
       Workflow завершён
```

**4. Кликает на HTTP ноду:**
```
Панель справа:
- Input: { event: "start" }
- Output: { status: 200, data: {...} }
- Duration: 45ms
- URL: https://api.example.com/...
```

**5. Находит ошибку в Code ноде:**
```
Нода горит красным ❌
Output: { error: "TypeError: Cannot read..." }
Клик → вкладка Input/Output → видно проблему
```

**6. Исправляет код, запускает снова:**
```
Все ноды зелёные ✅
Workflow выполнен успешно
```

---

## 📐 Техническая реализация

### 1. Сервис исполнения

```typescript
interface ExecutionState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentStep: number;
  totalSteps: number;
  nodeStatuses: Map<string, NodeExecutionStatus>;
}

interface NodeExecutionStatus {
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt?: Date;
  completedAt?: Date;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class WorkflowExecutionService {
  // WebSocket для real-time обновлений
  private ws: WebSocket;
  
  // Наблюдатель за статусом нод
  readonly nodeStatus$ = new BehaviorSubject<Map<string, NodeExecutionStatus>>(new Map());
  
  // Анимация связей
  readonly activeEdges$ = new BehaviorSubject<string[]>([]);
  
  startExecution(workflowId: string, mode: 'normal' | 'debug'): void {
    this.ws.send(JSON.stringify({
      type: 'start',
      workflowId,
      mode
    }));
  }
  
  pauseExecution(): void {
    this.ws.send(JSON.stringify({ type: 'pause' }));
  }
  
  resumeExecution(): void {
    this.ws.send(JSON.stringify({ type: 'resume' }));
  }
  
  stopExecution(): void {
    this.ws.send(JSON.stringify({ type: 'stop' }));
  }
  
  stepExecution(): void {
    this.ws.send(JSON.stringify({ type: 'step' }));
  }
}
```

### 2. Компонент ноды с анимацией

```typescript
@Component({
  selector: 'app-workflow-node',
  template: `
    <div class="node" 
         [class.running]="status() === 'running'"
         [class.success]="status() === 'success'"
         [class.error]="status() === 'error'">
      
      <!-- Статус исполнения -->
      <div class="node-status-icon">
        @switch (status()) {
          @case ('running') { <span class="spinner">⏳</span> }
          @case ('success') { <span class="check">✅</span> }
          @case ('error') { <span class="error">❌</span> }
        }
      </div>
      
      <!-- Контент ноды -->
      <div class="node-content">
        <div class="node-header">{{ node.data.label }}</div>
        @if (duration()) {
          <div class="node-duration">{{ duration() }}ms</div>
        }
      </div>
      
      <!-- Точки подключения с анимацией -->
      @for (edge of outgoingEdges(); track edge.id) {
        @if (edgeActive()) {
          <div class="edge-animation"></div>
        }
      }
    </div>
  `,
  styles: [`
    .node {
      position: relative;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px;
      background: white;
      transition: all 0.2s;
    }
    
    .node.running {
      border-color: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
    }
    
    .node.success {
      border-color: #22c55e;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
    }
    
    .node.error {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
    }
    
    .edge-animation {
      position: absolute;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, 
        transparent 0%, 
        #6366f1 50%, 
        transparent 100%);
      animation: flow 1s linear infinite;
    }
    
    @keyframes flow {
      from { transform: translateX(-100%); }
      to { transform: translateX(100%); }
    }
  `]
})
export class WorkflowNodeComponent {
  status = input<'idle' | 'running' | 'success' | 'error'>('idle');
  duration = input<number | null>(null);
  edgeActive = input<boolean>(false);
}
```

### 3. Панель Input/Output

```typescript
@Component({
  selector: 'app-io-panel',
  template: `
    <div class="io-panel">
      <div class="io-tabs">
        <button [class.active]="tab() === 'input'" 
                (click)="tab.set('input')">
          Input
        </button>
        <button [class.active]="tab() === 'output'" 
                (click)="tab.set('output')">
          Output
        </button>
      </div>
      
      @if (tab() === 'input') {
        <div class="io-content">
          <pre>{{ inputData() | json }}</pre>
          <button (click)="copy(inputData())">📋 Copy</button>
        </div>
      }
      
      @if (tab() === 'output') {
        <div class="io-content">
          <pre>{{ outputData() | json }}</pre>
          <button (click)="copy(outputData())">📋 Copy</button>
        </div>
      }
    </div>
  `
})
export class IoPanelComponent {
  tab = signal<'input' | 'output'>('input');
  inputData = input<unknown>(null);
  outputData = input<unknown>(null);
}
```

---

## 📋 План реализации

### Этап 1: Визуальное исполнение (2-3 дня)
- [ ] WorkflowExecutionService (WebSocket)
- [ ] NodeExecutionStatus tracking
- [ ] Подсветка активных нод (CSS классы)
- [ ] Анимация связей (CSS animation)

### Этап 2: Input/Output панель (1-2 дня)
- [ ] IoPanelComponent
- [ ] Сохранение input/output каждой ноды
- [ ] Копирование/экспорт JSON

### Этап 3: Контроль исполнения (1 день)
- [ ] Кнопки: Запустить, Пауза, Стоп, Шаг
- [ ] Execution progress bar
- [ ] Список выполненных шагов

### Этап 4: Убрать акцент с аналитики (0.5 дня)
- [ ] Скрыть A/B Config из header
- [ ] Переместить статистику во вкладку "Analytics"
- [ ] Сделать аналитику опциональной

---

## ✅ Критерии успеха

**Пользователь может:**
1. ✅ Видеть, какая нода выполняется **прямо сейчас**
2. ✅ Кликнуть на ноду → увидеть **input/output**
3. ✅ Наблюдать **анимацию** потока данных
4. ✅ **Остановить/продолжить** исполнение
5. ✅ **Пошагово** отладить workflow
6. ✅ **Скачать** input/output для анализа

**Пользователь больше не:**
- ❌ Ждёт 15 сек и смотрит в логи
- ❌ Открывает модальные окна для деталей
- ❌ Не понимает, где застряло исполнение
- ❌ Не видит, передались ли данные

---

## 🎯 Итог

**Текущий UX:** "A/B-тестирование с исполнением"

**Новый UX:** "Визуальный редактор workflow с отладкой как в n8n"

**Аналитика:** Осталась, но **скрыта** и доступна по запросу
