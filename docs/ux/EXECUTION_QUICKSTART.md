# 🚀 Быстрый старт: Визуальное исполнение workflow

## Что изменилось

### ✅ Добавлено
1. **WorkflowExecutionService** — управление исполнением с real-time статусом
2. **ExecutionPanelComponent** — панель исполнения с прогрессом и списком нод
3. **Визуализация статуса нод** — 🟢 успех, 🟡 выполнение, 🔴 ошибка
4. **Анимация рёбер** — бегущие точки при передаче данных

### ❌ Убрано
- Акцент на A/B-тестировании в header
- Аналитика на первом месте
- Сложные статистические метрики по умолчанию

---

## 🎯 Как использовать

### 1. Запуск исполнения

```typescript
// В workflow-editor.component.ts
import { WorkflowExecutionService } from './services/workflow-execution.service';
import { ExecutionPanelComponent } from './components/execution-panel/execution-panel.component';

// Добавить в imports
imports: [
  // ...
  ExecutionPanelComponent
]

// Использовать в template
<app-execution-panel (selectNode)="selectNodeOnCanvas($event)"></app-execution-panel>
```

### 2. Отслеживание статуса нод

```typescript
// Сервис автоматически обновляет статусы
executionService.nodeStarted('node-1', inputData);
executionService.nodeCompleted('node-1', outputData, 45);
executionService.nodeFailed('node-2', 'Error message');
```

### 3. Анимация рёбер

```typescript
// Активировать анимацию рёбер
executionService.setActiveEdges(['edge-1', 'edge-2']);

// Очистить анимацию
executionService.clearActiveEdges();
```

---

## 📐 Интеграция в существующий код

### Шаг 1: Обновить workflow-editor.component.ts

```typescript
// Добавить сервис
private executionService = inject(WorkflowExecutionService);

// Обновить метод simulateRun
simulateRun(count: number, mode: string = 'bulk'): void {
  // Начать исполнение
  const nodes = this.workflowService.nodes();
  this.executionService.startExecution(this.currentWorkflowId()!, nodes.length);
  
  // Запустить симуляцию
  this.simulationService.simulateRun(count, mode);
  
  // По завершении
  this.executionService.complete();
}
```

### Шаг 2: Добавить ExecutionPanel в template

```html
<!-- Заменить или добавить к существующей run-panel -->
<app-execution-panel (selectNode)="handleNodeSelect($event)"></app-execution-panel>
```

### Шаг 3: Обновить workflow-canvas.component.ts

```typescript
// Добавить сервис
private executionService = inject(WorkflowExecutionService);

// Вычислять статус ноды
nodeStatus = computed(() => {
  const nodeId = this.nodeId();
  return this.executionService.getNodeStatus(nodeId);
});

// Применять классы
[class.node-running]="nodeStatus() === 'running'"
[class.node-success]="nodeStatus() === 'success'"
[class.node-error]="nodeStatus() === 'error'"
```

---

## 🎨 Стилизация нод с статусом

```css
.node-wrap {
  position: absolute;
  border: 2px solid #e2e8f0;
  transition: all 0.2s;
}

.node-wrap.node-running {
  border-color: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
  animation: pulse 1.5s ease-in-out infinite;
}

.node-wrap.node-success {
  border-color: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
}

.node-wrap.node-error {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); }
  50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
}
```

---

## 🔍 Отладка исполнения

### Логирование

```typescript
// Подписаться на изменения
executionService.state$.subscribe(state => {
  console.log('Execution state:', state);
  console.log('Current node:', state.currentNodeId);
  console.log('Active edges:', state.activeEdges);
});
```

### WebSocket integration (для бэкенда)

```typescript
// В workflow-execution.service.ts
private ws: WebSocket;

connect(workflowId: string) {
  this.ws = new WebSocket(`ws://localhost:8080/v1/workflows/${workflowId}/execution`);
  
  this.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'node_started':
        this.nodeStarted(message.nodeId, message.input);
        break;
      case 'node_completed':
        this.nodeCompleted(message.nodeId, message.output, message.durationMs);
        break;
      case 'node_failed':
        this.nodeFailed(message.nodeId, message.error, message.input);
        break;
      case 'edge_active':
        this.setActiveEdges(message.edgeIds);
        break;
      case 'completed':
        this.complete();
        break;
    }
  };
}
```

---

## ✅ Чек-лист интеграции

- [ ] WorkflowExecutionService добавлен
- [ ] ExecutionPanelComponent в template
- [ ] Статусы нод отображаются (CSS классы)
- [ ] Анимация рёбер работает
- [ ] Кнопки Запуск/Пауза/Стоп работают
- [ ] Progress bar обновляется
- [ ] Input/Output видны в панели
- [ ] Клик на ноду в панели выделяет её на холсте

---

## 🎯 Следующие шаги

1. **Интегрировать с бэкендом** — WebSocket для real-time обновлений
2. **Добавить пошаговую отладку** — кнопка "Step" для отладки
3. **История исполнений** — список последних запусков
4. **Экспорт результатов** — скачать input/output всех нод

---

**Статус:** ✅ Готово к интеграции

**Время на интеграцию:** ~2-3 часа
