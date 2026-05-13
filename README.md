# kursach — FluxPilot Workflow Engine

Монорепо курсового проекта. Визуальный workflow-движок (n8n-like) с уклоном в продуктовые эксперименты.

## Структура
- `backend/` — Spring Boot 4 + Kotlin + PostgreSQL + MinIO (CAS).
- `frontend/` — Angular 19 (standalone, Signals).
- `deploy/` — `docker-compose.prod.yml`, `.env.example`, `install-server.sh` для VPS-деплоя.
- `.github/workflows/` — CI/CD на GitHub Actions (build → GHCR → SSH deploy).

## Быстрый старт (локально)

### Бэкенд
```bash
cd backend
docker compose up -d   # postgres + minio + app
# Swagger UI: http://localhost:8080/v1/swagger-ui.html
```

### Фронтенд
```bash
cd frontend
npm ci
npm start              # http://localhost:4200
```

## Документация
- Memory bank: `/Users/a.a.klushin/kursach/memory-bank/` (контекст, архитектура, решения, план).
- Бэк-аудит: `memory-bank/research/backend-audit.md`.
- Фронт-аудит: `memory-bank/research/frontend-audit.md`.
- План завершения: `memory-bank/progress/2026-05-12-completion-plan.md`.
- CI/CD: `memory-bank/decisions/2026-05-13-cicd-monorepo-vps-deploy.md` + `_cicd-draft/README.md` (root of `/Users/a.a.klushin/kursach`).

## Стек
- Kotlin 2.2 / Spring Boot 4.0 / JDK 24 / PostgreSQL 16 / Liquibase / MinIO (S3 CAS) / WebSocket-STOMP.
- Angular 19.2 / TypeScript 5.6 / Signals / Chart.js / self-written SVG canvas.
