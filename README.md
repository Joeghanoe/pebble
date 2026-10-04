# Pebble

A personal portfolio tracker. Positions across exchanges and brokers, transactions with
FIFO cost basis, live prices in EUR, and net worth over time.

- `frontend` — React + Vite SPA (TanStack Router/Query, Tailwind, shadcn/ui)
- `fastapi` — FastAPI, SQLModel, Alembic, Postgres
- `proxy` — stock [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) with Google
  sign-in, fronting both
- `tauri` — the mac desktop shell, a thin client over the deployment
- `.railway/railway.ts` — the Railway project as code; `.railway/README.md` is the
  deployment runbook

## How auth works

```
browser ──► oauth2-proxy (Google OIDC) ──► /api/*  → api   (private network)
                                       └──► /*     → web   (private network)
                                              api ──► postgres
```

Pebble is **single-tenant**: one portfolio, one owner. There is no user table and no
per-row scoping, so the whole security model is that only the owner reaches the API. Two
independent gates hold that up:

1. **oauth2-proxy** signs the caller in with Google and forwards the verified address as
   `X-Forwarded-Email`. Requests without a session never get past it.
2. **`ALLOWED_EMAILS` on the api** re-checks that address. A widened proxy configuration
   therefore does not by itself hand over the ledger.

The API refuses any request without that header, so it must never be exposed directly —
give it a public domain and anyone can set the header themselves. Only `proxy` gets a
public domain.

Sign out: `/oauth2/sign_out`.

## Run locally

Whole stack, no Google account needed (an nginx `edge` service stamps a fixed identity):

```bash
make up
open http://localhost:3000
```

Fast inner loop — Postgres from compose, API and web from source:

```bash
make db            # postgres on :5432
make api           # api  → http://localhost:1430  (REQUIRE_PROXY_IDENTITY=false)
make web           # web  → http://localhost:1420  (vite proxies /api to the api)
```

Tests:

```bash
make test          # pytest against a real Postgres, bun test, then eslint
```

The API tests deliberately run against Postgres rather than SQLite. Several queries are
raw SQL and the identity middleware is only meaningful over HTTP, so testing on a
different engine would prove nothing about the deployment. `make test-api` creates
`pebble_test` if it does not exist.

## Configuration

All on the `api` service.

| Variable | Default | Effect |
|---|---|---|
| `DATABASE_URL` | local compose Postgres | Postgres connection. Railway's `postgres://` scheme is normalised to `postgresql+psycopg://` automatically. |
| `ALLOWED_EMAILS` | empty | Comma-separated addresses allowed to use the deployment. **Empty means every address the proxy lets through is accepted** — set it. |
| `REQUIRE_PROXY_IDENTITY` | `true` | Set `false` only for local development with no proxy in front. Never in a deployment. |
| `MIGRATE_ON_STARTUP` | `true` | Run Alembic migrations on boot. The API is the only writer of the schema. |
| `COINGECKO_API_KEY` | empty | Lifts CoinGecko's anonymous rate limit for crypto prices. Stooq, Yahoo and Frankfurter need no key; without it refreshes still work and are throttled harder. |
| `PRICE_PROVIDERS` | `coingecko,stooq,yahoo` | Which upstreams to ask for prices. Stooq and Yahoo are unofficial endpoints with no published terms for this use — fine for a personal instance, worth dropping where that matters. A disabled source answers "no price", so its holdings show as stale or unavailable. An unknown name stops the API from starting. |
| `PROXY_EMAIL_HEADER` | `X-Forwarded-Email` | The header identity is read from. Change only if the proxy is configured differently. |
| `ENVIRONMENT` | `local` | `local` logs every SQL statement with timings. |

`/` and `/api/health` are the only unauthenticated routes, because Railway probes them
directly on the private network with no proxy in front.

## API

Every business route lives under **`/api/v1`**; the health check and `/` stay unversioned
because infrastructure probes them, not clients. The contract is committed as
`fastapi/openapi.snapshot.json` and CI fails when the app disagrees with it, so a change
to the API is always a visible diff. `make generate-client` refreshes the snapshot and
regenerates the TypeScript client in `frontend/src/client/`. A breaking change gets a new
version mounted next to the old one rather than an edit in place.

## Self-hosting

`docker-compose.prod.yml` runs the same four pieces on any Docker host, with any OIDC
provider:

```bash
cp .env.example .env      # PEBBLE_URL, ALLOWED_EMAILS, provider credentials, ...
docker compose -f docker-compose.prod.yml up -d --build
```

Only `proxy` publishes a port (4180). Put TLS in front of it — the session cookie is
`Secure` — and register `$PEBBLE_URL/oauth2/callback` as the redirect URI with your
provider. For anything other than Google set `OAUTH2_PROXY_PROVIDER=oidc` and
`OAUTH2_PROXY_OIDC_ISSUER_URL` (Keycloak, Zitadel, Authentik, Entra ID and so on).

The api must stay unpublished: it trusts the identity header the proxy sets, so anything
that can reach it directly can claim to be anyone. `SECURITY.md` has the full model.

## Deploying on Railway

`.railway/README.md` is the runbook. In short: `railway config apply` creates the five
resources, then `proxy` gets the public domain and the Google client credentials.

Postgres is Railway's **managed** Postgres, which is what gives the service a **Data** tab
in the dashboard for browsing and editing rows, plus managed backups.

### Google Cloud Console setup

One OAuth client is all Pebble needs.

1. Create or pick a project at https://console.cloud.google.com.
2. **APIs & Services → OAuth consent screen**: External, app name "Pebble", your email as
   support and developer contact. No scopes beyond the defaults (`openid`, `email`,
   `profile`).
3. **Leave the app in *Testing* and add only your own address as a test user.** This is
   the narrowest first gate available: oauth2-proxy can restrict to a list of addresses
   only through `--authenticated-emails-file`, and there is no file to mount into a stock
   image, so `OAUTH2_PROXY_EMAIL_DOMAINS` is `*`. With the consent screen in Testing,
   Google refuses everyone else before the proxy is asked. `ALLOWED_EMAILS` on the api
   is what actually protects the data either way.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web
   application*.
   - Authorised JavaScript origin: `https://<proxy domain>`
   - Authorised redirect URI: `https://<proxy domain>/oauth2/callback`
5. Copy the client ID and secret onto the `proxy` service on Railway as
   `OAUTH2_PROXY_CLIENT_ID` and `OAUTH2_PROXY_CLIENT_SECRET`.

`<proxy domain>` is the Railway domain on the `proxy` service (Settings → Networking), or
a custom domain attached there.

## On a phone

Open the proxy domain in Safari or Chrome and sign in. The session cookie lasts 30 days
(`OAUTH2_PROXY_COOKIE_EXPIRE`), so it is not a login every time you want to check a
balance. Add it to the home screen and it behaves like an app.

The dashboard, position detail and settings screens are laid out for a phone: the sidebar
becomes a sheet below 768px, the stat grids stack, and the transaction log drops the two
derivable columns so the delete control stays on screen instead of behind a horizontal
scroll.

## Importing the desktop app's data

The desktop build kept everything in a SQLite file in the app data directory. To move
that ledger into the deployment:

```bash
export DATABASE_URL='postgresql://postgres:PASSWORD@HOST:PORT/railway'
uv run scripts/import_local_data.py \
  ~/Library/Application\ Support/com.pebble.desktop/portfolio.db
```

It reports and exits; add `--write` to actually import. `uv run` reads the script's
inline dependencies, so there is nothing to install first.

`DATABASE_URL` has to be the **public** endpoint, which means giving the Postgres
service a TCP proxy (Railway dashboard → Postgres → Settings → Networking → TCP Proxy,
port 5432). The `DATABASE_URL` the api uses points at `postgres.railway.internal` and
resolves only inside Railway. Exposing Postgres on a public port is a real decision —
it is password-protected and over TLS, but it is reachable from the internet — so
remove the proxy again when the import is done if you do not want it there.

| Flag | Effect |
|---|---|
| *(none)* | Read the file, check it, print counts. Writes nothing. |
| `--write` | Upsert the rows by primary key. Re-runnable; anything already in Postgres but absent from the file is left alone. |
| `--replace` | Empty the tables first, for an exact mirror of the file. |
| `--force` | Import despite failed checks. They will probably be rejected anyway. |

Two things it does that a hand-rolled insert loop tends to miss:

- **The seeded exchanges exist in both databases.** Migration 001 puts `Crypto` (id 1)
  and `Manual` (id 2) into every Pebble database, so a plain `INSERT` collides on the
  primary key before it reaches your own rows. Rows are upserted by id, and the local
  file wins.
- **The desktop file predates instruments.** Each of its assets is resolved to an
  instrument by the same rule migration 009 uses, and its prices move to the instrument.
- **Explicit ids do not advance a Postgres sequence.** Import ids 1–9 and leave it
  there, and the next position you add in the app is handed id 1 again — a duplicate
  key error, and the same fault migration 002 exists to repair. Every sequence is
  realigned to `max(id)` at the end.

It also checks what SQLite never enforced. That engine ignores declared column widths
and had no enum for `type`, so a long-lived file can hold a `type` of `commodity` or a
date of `11 March 2024`; those are reported up front rather than failing the import
halfway through. Dangling foreign keys are caught the same way. The whole load runs in
one transaction, so a refusal leaves the hosted ledger untouched.

## Desktop shell

`tauri/` is a thin client: the window loads the hosted deployment. It no longer runs a
FastAPI sidecar or a local SQLite database, so the mac and the phone read the same
ledger — at the cost of no offline use.

Point it at your deployment with `PEBBLE_URL`; the window URL is merged in at build time
rather than committed:

```bash
PEBBLE_URL=https://pebble.example.com make desktop         # cargo tauri dev
PEBBLE_URL=https://pebble.example.com make desktop-build   # installers in tauri/target/release/bundle/
```

**Google may refuse to sign in inside the window.** Google blocks its OAuth flow in
embedded webviews (`disallowed_useragent`), and a Tauri window is one. If that happens,
sign in to the proxy domain once in Safari — or treat the desktop app as optional and use
the browser, which is what the phone does anyway. Working around the block by spoofing
the webview's user agent is possible but is deliberately not configured here.

## Architecture notes

**Prices.** `services/prices.py` fans out to CoinGecko (crypto), Stooq and Yahoo
(equities and ETFs) and Frankfurter (USD→EUR), and caches each answer per **instrument**
per day in `price_cache`. A position whose price has never been fetched reports `unavailable` rather
than guessing; a stale one reports `stale` with the date it is from. A routine refresh
(opening the app) runs at most every six hours, a forced one (the button) at most every
minute.

The throttle lives in Postgres, not the process: `services/refresh.py` claims a lease on
the `refresh_state` row with one conditional `UPDATE`, so any number of api replicas, and
the daily `jobs` cron (`python -m app.jobs.refresh`), share it and never refresh twice at
once. A lease that outlives a crashed process expires after 15 minutes.

**Cost basis.** Realized P&L is FIFO: sells consume the oldest buy lots first
(`crud.compute_realized_pnl`). Buy rows whose units have all been sold show as `Closed`.

**Deleted transactions** are soft-deleted — `deleted_at` is set and every query filters on
it — so a mistaken delete is recoverable in the database. Deleting a *position* is not
soft: it takes the position's transactions and snapshots with it, because orphaned rows
would keep counting towards net worth while the position was gone from the list. Its
cached prices stay with the instrument.

**Holdings and instruments.** An `asset` is a holding: a label, an exchange and an
`instrument_id`. The `instrument` is the market identity — type plus `coingecko_id` /
`yahoo_ticker` — and has no owner. Holdings naming the same feed share one instrument, so
BTC on two exchanges is fetched and cached once; holdings with no feed id (cash, manual
entries) each get their own. Changing a holding's type or feed id points it at another
instrument rather than editing a shared one. The API flattens the two back into the
`asset` shape it always had, plus `instrument_id`.

**Types.** Amounts, units and rates are `numeric(28, 10)` — exact storage and exact SQL
sums — and are read as floats in Python (`app/core/db.py`). Dates are `date` and the
soft-delete stamp is `timestamptz`; `app/core/types.py` converts them to and from the
`YYYY-MM-DD` / ISO 8601 strings the services and the API use. Raw SQL casts its date
parameters explicitly (`CAST(:date AS date)`), because SQLAlchemy binds strings as
`VARCHAR`, which does not compare with `date`.

## Contributing

See `CONTRIBUTING.md`. Security reports go through `SECURITY.md`, not issues.

## License

MIT.
