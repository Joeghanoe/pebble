#!/usr/bin/env bash
#
# Regenerate the TypeScript API client from the FastAPI app's OpenAPI schema.
#
# The Rust client this script also used to generate is gone: the desktop shell is a thin
# client over the deployment now and never talks to the API from Rust.
#
# The schema is read straight out of the app object, so no server has to be running —
# but importing app.main constructs the SQLAlchemy engine, which needs a DATABASE_URL
# that parses (it is never connected to).

set -euo pipefail

cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgres://pebble:pebble@localhost:5432/pebble}"

echo "==> Reading OpenAPI schema from the FastAPI app..."
(cd fastapi && uv run python -c \
  "import app.main, json; print(json.dumps(app.main.app.openapi()))") > frontend/openapi.json

echo "==> Generating TypeScript client..."
(cd frontend && bun run generate-client)

echo "==> Formatting..."
(cd frontend && bun run format)

echo "==> Done. Review the diff in frontend/src/client/."
