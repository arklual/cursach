# FluxPilot — Workflow Engine для A/B-тестов

**Визуальный конструктор пайплайнов с акцентом на продуктовые эксперименты и статистику.**

[![Build](https://github.com/arklual/kursach/workflows/CI/badge.svg)](https://github.com/yourusername/kursach/actions)
[![Coverage](.github/badges/jacoco.svg)](backend/target/site/jacoco/index.html)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🎯 Возможности

- **Визуальный редактор** — перетаскивайте ноды, соединяйте связями, настраивайте параметры
- **A/B-тестирование** — распределение трафика, статистическая значимость, power analysis
- **Aналитика** — конверсии, доверительные интервалы, p-value, временные ряды
- **Автоматизация** — запуск по расписанию, webhook, scheduler
- **Безопасный код** — Python sandbox в Docker для кастомной логики

## 🚀 Быстрый старт

### Локальная разработка

#### Бэкенд
```bash
cd backend
docker compose up -d   # postgres + minio + app
# Swagger UI: http://localhost:8080/v1/swagger-ui.html
```

#### Фронтенд
```bash
cd frontend
npm ci
npm start              # http://localhost:4200
```

### Продакшен (VPS)
```bash
cd deploy
cp .env.example .env
# Отредактируйте .env (DOMAIN, DB_PASSWORD, etc.)
bash install-server.sh
```

## 📚 Документация

### UX-дизайн
- [Персонаж пользователя](docs/ux/persona-student.md) — кто использует продукт
- [Информационная архитектура](docs/ux/information-architecture.md) — структура и сценарии
- [Спецификации дизайна](docs/ux/design-specs.md) — компоненты и layout
- [Пустые состояния](docs/ux/empty-states.md) — заглушки вместо моков
- [План внедрения](docs/ux/IMPLEMENTATION_PLAN.md) — roadmap улучшений

### Технические документы
- [Аудит бэкенда](backend/README.md) — архитектура и API
- [Аудит фронтенда](frontend/README.md) — компоненты и сервисы
- [Метрики и формулы](frontend/docs/metrics.md) — расчёт конверсий, CI, p-value
- [QA сценарии](frontend/docs/qa_scenarios.md) — ручное тестирование

### Для разработчиков
- Memory bank: `memory-bank/` (контекст, решения, прогресс)
- CI/CD: `.github/workflows/` + `memory-bank/decisions/cicd-monorepo-vps-deploy.md`

## 🛠 Стек технологий

| Слой | Технологии |
|------|-----------|
| **Backend** | Kotlin 2.2, Spring Boot 4.0, JDK 24 |
| **Database** | PostgreSQL 16, Liquibase |
| **Storage** | MinIO (S3-compatible CAS) |
| **Frontend** | Angular 19.2, TypeScript 5.6, Signals |
| **Charts** | Chart.js 4.x |
| **Real-time** | WebSocket (STOMP) |
| **Sandbox** | Docker (Python code execution) |
| **Deploy** | Docker Compose, GitHub Actions |

## 📦 Структура проекта

```
.
├── backend/              # Spring Boot API
│   ├── src/main/kotlin/
│   ├── db/              # Liquibase миграции
│   └── docker-compose.yml
├── frontend/            # Angular приложение
│   ├── src/app/
│   │   ├── components/  # UI компоненты
│   │   ├── pages/       # Страницы (editor, list)
│   │   ├── services/    # Сервисы (API, simulation)
│   │   └── core/        # API facade, mapper, WS
│   ├── docs/            # UX документация
│   └── e2e/             # Playwright тесты
├── deploy/              # Продакшен конфиги
│   ├── docker-compose.prod.yml
│   ├── .env.example
│   └── install-server.sh
├── docs/
│   └── ux/              # UX дизайн-документы
└── memory-bank/         # Контекст проекта
```

## 🎨 UX-принципы

1. **Прогрессивное раскрытие** — от простого к сложному (3 режима: Базовый/Подробный/Эксперт)
2. **Осмысленные данные** — реалистичные заглушки с контекстом вместо случайных чисел
3. **Обратная связь** — валидация графа до запуска, анимации, тултипсы
4. **Доступность** — WCAG 2.1 AA, ARIA-метки, клавиатурная навигация
5. **Онбординг** — интерактивный тур при первом запуске

## 📊 Пример использования

### 1. Создайте workflow
```
Trigger → A/B Fork → [Variant A: HTTP] → Join
                  ↘  [Variant B: HTTP] ↗
```

### 2. Настройте параметры
- **A/B Fork**: 50/50 трафика, hashed randomization
- **HTTP**: GET https://api.example.com/checkout
- **Метрика**: Конверсия в оплату

### 3. Запустите симуляцию
```bash
# Через UI: кнопка "Симуляция (500)"
# Результат через ~15 сек:
```

### 4. Анализ результатов
```
Вариант A: 25% конверсия (CI: 21–29%)
Вариант B: 31% конверсия (CI: 22–40%)
Разница: +6 п.п. (p-value = 0.043) ✅

Рекомендация: Rollout варианта B
```

## 🤝 Вклад

1. Fork репозиторий
2. Создайте ветку (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

### Требования к коду
- **Backend**: Ktlint, тесты (JUnit), Swagger-документация
- **Frontend**: ESLint, тесты (Jest + Playwright), строгие типы

## 📝 License

MIT License — см. [LICENSE](LICENSE)

---

**FluxPilot** — создано для курсового проекта 🎓
