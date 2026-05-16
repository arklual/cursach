# План внедрения нового UX

## 📋 Резюме

Этот документ описывает план перехода от текущего интерфейса к новому UX с фокусом на понятность и удобство для студентов.

**Цель:** Сделать интерфейс интуитивным настолько, чтобы пользователь мог собрать первый workflow за 5 минут без чтения документации.

---

## 🎯 Приоритеты

### P0 — Критично (сделать в первую очередь)
1. Пустые состояния вместо моков
2. Индикатор готовности графа
3. Упрощённые термины (базовый режим)
4. Онбординг при первом запуске

### P1 — Важно (следующая итерация)
5. Разделение на режимы (Редактор / Запуск / Результаты)
6. Контекстные подсказки
7. Валидация графа до запуска
8. Автосохранение

### P2 — Желательно (будущие улучшения)
9. Шаблоны workflow
10. Экспорт результатов (CSV/JSON)
11. Режим эксперта
12. Клавиатурные сокращения

---

## 📦 Этапы реализации

### Этап 1: Пустые состояния (1-2 дня)

**Задачи:**
- [ ] Главный экран — нет workflow
- [ ] Холст — нет нод
- [ ] Результаты — нет симуляции
- [ ] Логи — нет запусков
- [ ] Инспектор — нода не выбрана

**Файлы для изменения:**
```
frontend/src/app/pages/workflows-list/
frontend/src/app/pages/workflow-editor/
frontend/src/app/components/
```

**Пример реализации:**
```typescript
// workflow-editor.component.ts
@if (nodes().length === 0) {
  <div class="empty-state">
    <h3>📭 Холст пуст</h3>
    <p>Перетащите ноду из палитры слева или нажмите Ctrl+N</p>
    <div class="quick-start-nodes">
      <button (click)="addNode('trigger')">🎯 Trigger</button>
      <button (click)="addNode('ab')">⚖ A/B Fork</button>
      <button (click)="addNode('http')">🌐 HTTP</button>
    </div>
  </div>
}
```

---

### Этап 2: Осмысленные заглушки (2-3 дня)

**Задачи:**
- [ ] Реалистичные данные для A/B теста
- [ ] Пояснения статистических терминов
- [ ] Тултипсы с объяснениями

**Файлы для изменения:**
```
frontend/src/app/services/simulation.service.ts
frontend/src/app/components/analytics-modal/
```

**Пример реализации:**
```typescript
// simulation.service.ts
interface SimulationScenario {
  name: string;
  description: string;
  expectedConversion: number;
  sampleSize: number;
}

const SCENARIOS: SimulationScenario[] = [
  {
    name: 'A/B тест кнопки',
    description: 'Сравнение цвета кнопки "Купить"',
    expectedConversion: 0.25,
    sampleSize: 500
  },
  {
    name: 'Воронка онбординга',
    description: 'Анализ потерь на этапах активации',
    expectedConversion: 0.26,
    sampleSize: 1000
  }
];

generateMockData(scenario: SimulationScenario) {
  // Генерирует реалистичные данные на основе сценария
}
```

---

### Этап 3: Индикатор готовности (1 день)

**Задачи:**
- [ ] Валидация графа (есть ли старт/конец)
- [ ] Проверка подключенных нод
- [ ] Визуальная индикация (🟢/🟡/🔴)

**Файлы для изменения:**
```
frontend/src/app/core/api/workflow.facade.ts
frontend/src/app/pages/workflow-editor/
```

**Пример реализации:**
```typescript
// workflow.validator.ts
interface ValidationResult {
  ready: boolean;
  status: 'ready' | 'warning' | 'error';
  message: string;
  issues: ValidationIssue[];
}

validateGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // Проверка: есть ли стартовая нода
  const hasTrigger = nodes.some(n => n.data.kind === 'trigger');
  if (!hasTrigger) {
    issues.push({
      severity: 'error',
      message: 'Нет стартовой ноды (Trigger)',
      fix: 'Добавьте ноду типа Trigger'
    });
  }
  
  // Проверка: все ли ноды подключены
  const connectedNodeIds = new Set([
    ...edges.map(e => e.source),
    ...edges.map(e => e.target)
  ]);
  
  for (const node of nodes) {
    if (!connectedNodeIds.has(node.id) && nodes.length > 1) {
      issues.push({
        severity: 'warning',
        message: `Нода "${node.data.label}" не подключена`,
        fix: 'Соедините с другими нодами'
      });
    }
  }
  
  return {
    ready: issues.filter(i => i.severity === 'error').length === 0,
    status: issues.length === 0 ? 'ready' : 
            issues.some(i => i.severity === 'error') ? 'error' : 'warning',
    message: getStatusMessage(issues),
    issues
  };
}
```

---

### Этап 4: Упрощение терминов (1-2 дня)

**Задачи:**
- [ ] Переименовать p̂ → "Конверсия"
- [ ] Добавить пояснения к терминам
- [ ] Переключатель режимов (Простой/Эксперт)

**Файлы для изменения:**
```
frontend/src/app/components/analytics-modal/
frontend/src/app/components/palette/
frontend/src/app/components/inspector/
```

**Пример реализации:**
```typescript
// statistics.utils.ts
interface StatTerm {
  simple: string;      // Для базового режима
  expert: string;      // Для экспертного
  description: string; // Пояснение
  formula?: string;    // Формула (для экспертов)
}

const STAT_TERMS: Record<string, StatTerm> = {
  pHat: {
    simple: 'Конверсия',
    expert: 'p̂ (sample proportion)',
    description: 'Доля пользователей, выполнивших целевое действие',
    formula: 'p̂ = k / N'
  },
  ci95: {
    simple: 'Доверительный интервал',
    expert: 'CI95% (Confidence Interval)',
    description: 'Диапазон, где с вероятностью 95% находится истинная конверсия',
    formula: 'CI = p̂ ± 1.96·√(p̂(1-p̂)/N)'
  },
  pValue: {
    simple: 'Значимость',
    expert: 'p-value',
    description: 'Вероятность, что разница случайна. < 0.05 — разница реальна',
    formula: 'p = 2(1 - Φ(|z|))'
  }
};
```

---

### Этап 5: Онбординг (2-3 дня)

**Задачи:**
- [ ] Тур при первом запуске (4 шага)
- [ ] Контекстные подсказки
- [ ] Сохранение прогресса (localStorage)

**Файлы для изменения:**
```
frontend/src/app/components/onboarding-tour/
frontend/src/app/services/user-preferences.service.ts
```

**Пример реализации:**
```typescript
// onboarding-tour.component.ts
interface TourStep {
  id: string;
  title: string;
  description: string;
  highlightElement: string; // CSS selector
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: '👋 Добро пожаловать!',
    description: 'Здесь вы создадите свой первый workflow. Начнём?',
    highlightElement: '.app-header',
    position: 'bottom'
  },
  {
    id: 'palette',
    title: '📥 Палитра нод',
    description: 'Перетащите ноду отсюда на холст',
    highlightElement: '.palette-component',
    position: 'right',
    action: () => this.highlightPalette()
  },
  {
    id: 'canvas',
    title: '🎨 Холст',
    description: 'Здесь собирается пайплайн. Соединяйте ноды линиями',
    highlightElement: '.canvas-component',
    position: 'top'
  },
  {
    id: 'run',
    title: '▶ Запуск',
    description: 'Нажмите, чтобы протестировать workflow',
    highlightElement: '.run-button',
    position: 'bottom'
  }
];

constructor(private prefs: UserPreferencesService) {}

ngOnInit() {
  const hasSeenTour = this.prefs.get('onboarding_completed');
  if (!hasSeenTour) {
    this.startTour();
  }
}

completeTour() {
  this.prefs.set('onboarding_completed', true);
}
```

---

### Этап 6: Валидация и тесты (2 дня)

**Задачи:**
- [ ] E2E тесты для новых состояний
- [ ] Проверка доступности (ARIA)
- [ ] Тесты на мобильных устройствах

**Файлы для изменения:**
```
frontend/e2e/
frontend/src/app/**/*.spec.ts
```

**Пример теста:**
```typescript
// empty-state.e2e.ts
import { test, expect } from '@playwright/test';

test.describe('Empty States', () => {
  test('should show empty state when no workflows', async ({ page }) => {
    await page.goto('/workflows');
    
    await expect(page.getByText('У вас пока нет workflow')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Создать workflow' })).toBeVisible();
  });

  test('should show empty canvas state', async ({ page }) => {
    await page.goto('/workflow/new');
    
    await expect(page.getByText('Холст пуст')).toBeVisible();
    await expect(page.getByText('Перетащите ноду из палитры')).toBeVisible();
  });

  test('should provide quick start from empty canvas', async ({ page }) => {
    await page.goto('/workflow/new');
    
    await page.getByRole('button', { name: '🎯 Trigger' }).click();
    
    await expect(page.getByText('Trigger')).toBeVisible();
  });
});
```

---

## 📊 Метрики успеха

### Количественные
- **Время до первого запуска**: < 5 минут (сейчас: ~15 мин)
- **Количество ошибок при валидации**: < 10% запусков (сейчас: ~40%)
- **Завершение онбординга**: > 80% пользователей (цель)

### Качественные
- Пользователь понимает, что делает на каждом шаге
- Пользователь может интерпретировать результаты
- Пользователь не гуглит термины (p̂, CI, p-value)

---

## 🎨 Дизайн-система

### Цвета
```css
:root {
  /* Основные */
  --primary-500: #6366f1;
  --primary-600: #4f46e5;
  
  /* Статусы */
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
  
  /* Фон */
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  
  /* Текст */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #94a3b8;
  
  /* Границы */
  --border-default: #e2e8f0;
  --border-strong: #cbd5e1;
}
```

### Типографика
```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'SF Mono', Menlo, Consolas, monospace;
  
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 24px;
}
```

### Компоненты
```css
/* Кнопки */
.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-500);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

/* Карточки */
.card {
  background: white;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* Пустые состояния */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-secondary);
}

.empty-state h3 {
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 24px;
}
```

---

## 📁 Структура документов

```
docs/ux/
├── persona-student.md          # Персонаж пользователя
├── information-architecture.md # ИА и сценарии
├── design-specs.md             # Спецификации компонентов
├── empty-states.md             # Пустые состояния
└── IMPLEMENTATION_PLAN.md      # Этот документ
```

---

## 🚀 Быстрый старт для реализации

### День 1-2: Пустые состояния
1. Создать компоненты empty-state
2. Интегрировать в страницы
3. Протестировать

### День 3-4: Заглушки данных
1. Обновить simulation.service
2. Добавить пояснения терминов
3. Протестировать с реальными данными

### День 5: Валидация
1. Создать workflow.validator
2. Добавить индикатор готовности
3. E2E тесты

### День 6-7: Онбординг
1. Создать тур (4 шага)
2. Сохранение прогресса
3. Тестирование

---

## ✅ Чек-лист готовности

### Функциональность
- [ ] Пустые состояния работают
- [ ] Заглушки реалистичны
- [ ] Валидация графа работает
- [ ] Онбординг завершается успешно

### Доступность
- [ ] ARIA-метки на всех кнопках
- [ ] Контрастность ≥ 4.5:1
- [ ] Клавиатурная навигация работает
- [ ] Скринридеры читают контент

### Производительность
- [ ] Первая отрисовка < 2 сек
- [ ] Анимации 60 FPS
- [ ] Нет утечек памяти

### Документация
- [ ] README обновлён
- [ ] Скриншоты актуальны
- [ ] Примеры работают

---

## 📞 Поддержка

Вопросы и предложения по UX:
- Открыть issue в репозитории
- Обсудить в чате команды
- Провести юзабилити-тестирование

**Следующие шаги после внедрения:**
1. Собрать фидбэк от пользователей
2. Провести A/B тест нового UX
3. Итеративно улучшать на основе метрик
