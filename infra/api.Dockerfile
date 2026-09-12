# Pebble API — FastAPI on uvicorn. Multi-stage: resolve dependencies with uv, then a
# runtime image carrying only the virtualenv and the source.
# Build context is the repo root (see .dockerignore).
FROM python:3.12-slim AS build

# uv resolves from the committed lockfile, so the image gets the same versions as a
# local `uv sync`.
COPY --from=ghcr.io/astral-sh/uv:0.9.9 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /src
# Dependencies first: this layer is cached until the lockfile changes. Installing the
# project itself is skipped — the app is copied in, not packaged.
COPY fastapi/pyproject.toml fastapi/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project


FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    ENVIRONMENT=production

WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY fastapi/app ./app
COPY fastapi/alembic.ini ./alembic.ini

# Run unprivileged. Nothing is written to disk at runtime — the database is Postgres
# and there is no data directory any more.
RUN useradd --create-home --uid 1001 pebble && chown -R pebble:pebble /app
USER pebble

EXPOSE 8080
# Railway injects $PORT; 8080 is the fallback for a plain `docker run`. Shell form so
# the variable is expanded. One worker on purpose: the price-refresh cooldown in
# routes/prices.py is a module-level global, so a second worker would get its own.
CMD ["sh", "-c", "exec uvicorn app.main:app --host :: --port ${PORT:-8080} --workers 1"]
