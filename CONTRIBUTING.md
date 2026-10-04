# Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue
first so the approach can be agreed before the work is done.

## Setup

```bash
make setup         # bun + uv dependencies
make db            # Postgres on :5432 (docker compose)
make api           # API on :1430, no proxy needed
make web           # SPA on :1420, proxies /api to the API
```

`make up` runs the whole stack behind a local stand-in for oauth2-proxy on :3000.

## Before you open a pull request

```bash
make test          # pytest against real Postgres, bun test, eslint, tsc
make openapi-check # the API contract matches the committed snapshot
```

CI runs both. Some ground rules that keep the history reviewable:

- **Tests run against Postgres, never SQLite.** Much of the backend is raw SQL whose
  behaviour is engine-specific; a test on another engine proves nothing.
- **The API contract is committed.** Changing a route or model changes
  `fastapi/openapi.snapshot.json`: run `make generate-client` (which refreshes the
  snapshot and the TypeScript client) and commit both. Routes live under `/api/v1`; a
  breaking change needs a new version rather than an edit in place.
- **Schema changes are Alembic migrations** in `fastapi/app/alembic/versions/`, numbered
  in sequence, with a working `downgrade()`. Migrations run against live financial
  data: say in the docstring what happens to existing rows.
- **No secrets in git.** Railway variables that hold secrets are declared with
  `preserve()` in `.railway/railway.ts`; self-hosted ones live in `.env`.
- Match the surrounding code. Comments explain why, not what.

## Licence

By contributing you agree your work is released under the MIT licence in `LICENSE`.
