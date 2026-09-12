# =============================================================================
# Pebble
# =============================================================================

.PHONY: help setup up down db api web test test-api lint migrate revision generate-client desktop desktop-build clean

PROJECT_ROOT := $(shell pwd)

# Local Postgres from docker-compose. Override to point at something else.
DATABASE_URL ?= postgres://pebble:pebble@localhost:5432/pebble
TEST_DATABASE_URL ?= postgres://pebble:pebble@localhost:5432/pebble_test

##@ Setup

# Install frontend and backend dependencies. The Tauri CLI is only needed if you
# build the desktop shell; see `make desktop`.
setup:
	@echo "==> Installing frontend dependencies (bun)..."
	cd frontend && bun install
	@echo "==> Installing backend dependencies (uv)..."
	cd fastapi && uv sync
	@echo "==> Done."

##@ Run

# The whole stack behind a local stand-in for oauth2-proxy, on http://localhost:3000.
# No Google account needed: the edge stamps a fixed identity header.
up:
	docker compose up --build

down:
	docker compose down

# Just Postgres, for running the API and web from source.
db:
	docker compose up postgres -d

# API only, against the compose Postgres. REQUIRE_PROXY_IDENTITY=false because there
# is no proxy in front of it here — never set that in a deployment.
api:
	cd fastapi && DATABASE_URL=$(DATABASE_URL) REQUIRE_PROXY_IDENTITY=false \
		uv run uvicorn app.main:app --reload --port 1430

# Frontend only. Vite proxies /api to the API on 1430.
web:
	cd frontend && bun run dev

##@ Test

test: test-api
	cd frontend && bun run lint

# The API tests run against a real Postgres, not SQLite: they exist to pin the raw SQL
# and the identity middleware as they behave in the deployment.
test-api:
	createdb -h localhost -U pebble pebble_test 2>/dev/null || true
	cd fastapi && TEST_DATABASE_URL=$(TEST_DATABASE_URL) uv run pytest

lint:
	cd fastapi && uv run ruff check app tests
	cd frontend && bun run lint

##@ Database

# The API runs migrations on startup; this is for running them by hand.
migrate:
	cd fastapi && DATABASE_URL=$(DATABASE_URL) uv run alembic upgrade head

# make revision m="add a column"
revision:
	cd fastapi && DATABASE_URL=$(DATABASE_URL) uv run alembic revision --autogenerate -m "$(m)"

##@ Code generation

# Regenerate the TypeScript client from the API's OpenAPI schema.
generate-client:
	@./scripts/generate-client.sh

##@ Desktop shell

# A thin client over the deployment: the window loads the hosted URL, there is no
# local backend. Set the URL in tauri/tauri.conf.json first.
desktop:
	cd tauri && cargo tauri dev

desktop-build:
	cd tauri && cargo tauri build

##@ Maintenance

clean:
	@echo "==> Cleaning..."
	cd tauri && cargo clean 2>/dev/null || true
	rm -rf frontend/dist frontend/node_modules
	rm -rf fastapi/.venv fastapi/.pytest_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
	rm -f frontend/openapi.json openapi.json
	@echo "==> Done."

##@ Help

help:
	@grep -E '^[a-zA-Z_-]+:.*?##@ .*$$|^##@' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?##@ "}; /^##@/ {printf "\n  \033[1m%s\033[0m\n", substr($$0, 5)} /^[a-zA-Z_-]+:/ {printf "    %-18s %s\n", $$1, $$2}'
	@echo ""
	@echo "  Run 'make up' for the whole stack on http://localhost:3000"
	@echo ""
