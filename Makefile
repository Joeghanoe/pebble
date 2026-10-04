# =============================================================================
# Pebble
# =============================================================================

.PHONY: help setup up down db api web test test-api test-web lint migrate revision generate-client openapi openapi-check desktop-url desktop desktop-build clean

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

test: test-api test-web
	cd frontend && bun run lint
	cd frontend && bun run typecheck

# The frontend's pure logic (the Strategy view's regime rule and projection), on
# bun's built-in runner: no browser, no extra dependency.
test-web:
	cd frontend && bun run test

# The API tests run against a real Postgres, not SQLite: they exist to pin the raw SQL
# and the identity middleware as they behave in the deployment.
#
# createdb runs with -w (never prompt). Against a password-protected server it would
# otherwise stop and ask, and because stderr is hidden the prompt is invisible -- which
# is how this hung a CI runner for four minutes before anyone cancelled it. Redirecting
# stdin does not help: createdb reads the prompt from /dev/tty, not stdin. With -w it
# fails immediately instead, and pytest then reports the real problem.
test-api:
	createdb -w -h localhost -U pebble pebble_test 2>/dev/null || true
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
generate-client: openapi
	@./scripts/generate-client.sh

# The committed copy of the API contract. Regenerate it with every change to a route or
# model: CI fails when the app's schema and this file disagree, so a contract change is
# always a visible diff in review rather than something the client finds out about.
OPENAPI_SNAPSHOT := fastapi/openapi.snapshot.json
OPENAPI_DUMP = cd fastapi && DATABASE_URL=$(DATABASE_URL) uv run python -c \
	"import app.main, json; print(json.dumps(app.main.app.openapi(), indent=2, sort_keys=True))"

openapi:
	@$(OPENAPI_DUMP) > ../$(OPENAPI_SNAPSHOT)
	@echo "==> Wrote $(OPENAPI_SNAPSHOT)"

openapi-check:
	@$(OPENAPI_DUMP) | diff -u ../$(OPENAPI_SNAPSHOT) - \
		|| (echo "==> API contract changed: run 'make openapi' and commit the snapshot" && exit 1)

##@ Desktop shell

# A thin client over the deployment: the window loads the hosted URL, there is no
# local backend. PEBBLE_URL is your proxy domain, e.g.
#   PEBBLE_URL=https://pebble.example.com make desktop
#
# Tauri merges --config as a JSON merge patch, which replaces arrays whole, so the patch
# carries the committed window definition plus the URL rather than the URL alone.
PEBBLE_URL ?=
TAURI_URL_PATCH = python3 -c 'import json, os; \
	w = json.load(open("tauri.conf.json"))["app"]["windows"][0]; \
	w["url"] = os.environ["PEBBLE_URL"]; \
	print(json.dumps({"app": {"windows": [w]}}))'

desktop-url:
	@test -n "$(PEBBLE_URL)" || (echo "==> Set PEBBLE_URL to your deployment, e.g. PEBBLE_URL=https://pebble.example.com" && exit 1)

desktop: desktop-url
	cd tauri && PEBBLE_URL=$(PEBBLE_URL) cargo tauri dev --config "$$($(TAURI_URL_PATCH))"

desktop-build: desktop-url
	cd tauri && PEBBLE_URL=$(PEBBLE_URL) cargo tauri build --config "$$($(TAURI_URL_PATCH))"

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
