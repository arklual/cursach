# FluxPilot — платформа для no-code автоматизации бизнес-процессов

No-code business process automation platform.

[![Build](https://github.com/arklual/cursach/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/arklual/cursach/actions/workflows/ci.yml)
[![Backend coverage](.github/badges/jacoco.svg)](https://github.com/arklual/cursach/actions/workflows/coverage-badge.yml)
[![Frontend coverage](.github/badges/frontend-coverage.svg)](https://github.com/arklual/cursach/actions/workflows/frontend-coverage-badge.yml)

## Описание

Веб-платформа для визуального проектирования и автоматического исполнения
бизнес-процессов (workflow) без написания кода. Решает задачи интеграции систем
через HTTP-запросы, обработки и трансформации потоков данных, запуска по
расписанию (cron) и webhook, а также проведения A/B-экспериментов с разделением
трафика. Движок строится на концепции узлов и связей и дополнен двухуровневым
версионированием с откатом, именованными снапшотами, контент-адресуемым хранением
конфигов для дедупликации, изолированным исполнением пользовательского кода в
одноразовых Docker-контейнерах, отладкой через WebSocket и feature-флагами.

Продакшен-инстанция: <https://fluxpilot.ru/> (Swagger UI — `/v1/swagger-ui.html`).

## Возможности

- Визуальный редактор workflow: drag-and-drop узлов, SVG-рёбра, zoom/pan, debounced-save.
- Три типа триггеров: ручной запуск, scheduler (cron), webhook.
- Узлы: HTTP, потоки данных (filter, map, reduce, foreach, flatmap), Code Node (Python/JavaScript).
- Параллельное исполнение независимых ветвей с топологической сортировкой и изоляцией сбоев.
- Изолированная Docker-песочница для пользовательского кода (network none, read-only FS, лимиты CPU/RAM).
- Двухуровневое версионирование с откатом и именованные снапшоты.
- Контент-адресуемое хранение конфигов в MinIO с дедупликацией по SHA-256.
- Трансляция событий исполнения по WebSocket (STOMP поверх SockJS).
- A/B-аналитика: конверсии, доверительные интервалы, z-тест двух пропорций.

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | Kotlin 2.2, Spring Boot 3.5.3, JDK 24 |
| База данных | PostgreSQL 16, Liquibase |
| Хранилище | MinIO (S3-совместимое, content-addressed) |
| Frontend | Angular 19.2, TypeScript 5.6 |
| Real-time | WebSocket (STOMP/SockJS) |
| Песочница | Docker (исполнение Python/JS) |
| CI/CD и деплой | GitHub Actions, Docker Compose |

## Быстрый старт

Бэкенд:

```bash
cd backend
docker compose up -d   # postgres + minio + app
# Swagger UI: http://localhost:8080/v1/swagger-ui.html
```

Фронтенд:

```bash
cd frontend
npm ci
npm start              # http://localhost:4200
```

Продакшен (VPS):

```bash
cd deploy
cp .env.example .env   # задайте DOMAIN, DB_PASSWORD и т.д.
bash install-server.sh
```

## Структура

```
backend/    Spring Boot API (Kotlin), Liquibase-миграции
frontend/   Angular SPA, e2e-тесты Playwright
deploy/     docker-compose.prod.yml, install-server.sh
docs/ux/    UX-документы
memory-bank/ контекст проекта
```

## Документация

- Бэкенд: [backend/README.md](backend/README.md)
- Фронтенд: [frontend/README.md](frontend/README.md)
- Проектная документация (ТЗ, ПЗ, ПМИ, РО): `docs/`

---

Курсовой проект, НИУ ВШЭ, ФКН, ОП «Дизайн и разработка информационных продуктов», 2026.
