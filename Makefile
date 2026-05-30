# FluxPilot — удобные цели для локального прогона тестов и инфраструктуры.
# Полный прогон всех автоматических тестов: make test
.PHONY: help dev-up dev-down test test-backend test-frontend-unit test-e2e

help:
	@echo "FluxPilot Makefile"
	@echo "  make dev-up            — поднять PostgreSQL + MinIO (deploy/docker-compose.dev.yml)"
	@echo "  make dev-down          — остановить dev-инфраструктуру"
	@echo "  make test              — backend (mvn verify) + frontend unit + e2e"
	@echo "  make test-backend      — серверные модульные + интеграционные тесты + JaCoCo"
	@echo "  make test-frontend-unit— клиентские модульные тесты (Karma/Jasmine)"
	@echo "  make test-e2e          — end-to-end тесты (Playwright)"

dev-up:
	docker compose -f deploy/docker-compose.dev.yml up -d

dev-down:
	docker compose -f deploy/docker-compose.dev.yml down

test: test-backend test-frontend-unit test-e2e

test-backend:
	cd backend && mvn verify

test-frontend-unit:
	cd frontend && npm ci && npm test -- --watch=false --browsers=ChromeHeadlessCI

test-e2e:
	cd frontend && npx playwright test
