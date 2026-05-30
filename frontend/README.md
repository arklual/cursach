# FluxPilot Workflow Lab

Интерактивный HTML-прототип workflow-платформы с поддержкой A/B-разветвлений, симуляции пользователей и аналитикой на уровне каждой ноды.

## Запуск

Откройте `index.html` в современном браузере. Все данные замоканы и выполняются на фронтенде.

## Основные возможности

- Canvas с drag & drop палитрой нод, соединениями, группировкой и миникартой.
- Inspector c настройкой параметров, распределением трафика (валидация сумм), randomization modes и stopping rules.
- A/B Test Config modal с power-калькулятором, seed, stratified allocation и предупреждениями.
- Execution panel с логом, контролем режимов запуска и replay.
- Node Analytics modal: p̂, Var, CI, таблица "кто дошёл", графики и экспорт sample payloads.
- Experiment Results dashboard: сравнение A vs B, Δ, CI(Δ), p-value, сегментация.
- Webhook & Scheduler manager: управление вебхуками, превью payloads.
- Documentation артефакты: JSON схемы событий, таблица метрик, ER/DDL и QA-сценарии.

### Шаблон запроса к дизайнеру

```
Создай кликабельный прототип Figma интерфейса workflow-редактора. Включи Canvas, Inspector, A/B-Fork config, Node Analytics modal и Experiment Results dashboard. Добавь интерактивную симуляцию трафика (N users) и реальные расчёты конверсий p̂ и 95% CI. Приложи JSON-схемы событий и short QA сценарии. Используй понятные подсказки для статистики (p̂, Var, CI) и интерфейс для установки доли трафика.
```
