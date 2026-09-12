# Railway infrastructure as code

`railway.ts` is the source of truth for the shape of the Railway project: which services
exist, how each is built, what it consumes, and which variables must not be deleted.

**Nothing here is read at deploy time.** Railway does not fetch this file when it builds.
A human applies it with the CLI:

```bash
railway login
railway link            # pick the Pebble project + environment
railway config plan     # read-only: what WOULD change
railway config apply    # applies, after showing the plan again
```

Editing the file is inert; applying it is the action with a blast radius. The file mirrors
the whole project, so a resource that exists in Railway but not here reads as "delete it".

The deprecated Config as Code (`railway.json` / `railway.toml`) is not used anywhere in
this repo.

## Topology

```
browser ──HTTPS──► proxy (oauth2-proxy, Google)  ── public domain
                     ├─ /api/*  ──► api  (FastAPI)        ── private network only
                     └─ /*      ──► web  (nginx + SPA)    ── private network only
                                     api ──► postgres
```

Only `proxy` has a public domain. `api` trusts `X-Forwarded-Email` from the proxy and
rejects requests without it, so it must never get a public domain: give it one and anyone
can forge the header. `web` has no reason to be public either.

`postgres` is Railway's **managed** Postgres (`postgres("postgres")` in `railway.ts`),
not a `postgres:17` image on a volume. That is what provides the service's **Data** tab in
the dashboard — browse and edit rows without a `psql` client — along with managed backups
and the connection string. `DATABASE_URL` on `api` is a reference to that service and is
managed by this file.

## Who can get in

Pebble is single-tenant. There is no user table and no per-row scoping, so the entire
security model is that only the owner reaches the API. Two independent gates:

1. **Google** decides who can complete the OAuth flow. Leaving the consent screen in
   *Testing* with one test user is the narrowest first gate available, because
   oauth2-proxy can only restrict to a list of addresses via
   `--authenticated-emails-file` and there is no file to mount into a stock image.
   `OAUTH2_PROXY_EMAIL_DOMAINS` is therefore `*` — anything narrower that is still
   env-only (`gmail.com`, say) would read as a restriction while admitting every Gmail
   user.
2. **`ALLOWED_EMAILS` on `api`** decides whose session is actually served. Everyone else
   gets 401 on every route. This is the gate that protects the data; it lives in
   `railway.ts` rather than the dashboard so changing who can read the ledger shows up
   in a diff.

An account that passes (1) but not (2) sees a "this account cannot open Pebble" page
rather than an app full of empty panels.

## First-time setup

1. Push `main`, then `railway config apply` from a linked checkout to create the four
   resources.
2. In the dashboard give `proxy` a domain (Settings → Networking → Generate Domain, or a
   custom one).
3. In Google Cloud Console create an OAuth 2.0 client (Web application) with the redirect
   URI `https://<proxy domain>/oauth2/callback`. See the main README for the full walkthrough.
4. Set these variables on `proxy` (declared with `preserve()`, so applies never remove them):

   | Variable | Value |
   |---|---|
   | `OAUTH2_PROXY_CLIENT_ID` | Google client ID |
   | `OAUTH2_PROXY_CLIENT_SECRET` | Google client secret |
   | `OAUTH2_PROXY_COOKIE_SECRET` | 32 random bytes, base64: `python3 -c 'import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())'` |
   | `OAUTH2_PROXY_REDIRECT_URL` | `https://<proxy domain>/oauth2/callback` |

5. Check `ALLOWED_EMAILS` on `api` in `railway.ts` is your address.
6. Optional, on `api`: `COINGECKO_API_KEY` lifts CoinGecko's anonymous rate limit.
7. Redeploy `proxy` after setting variables.

The API runs its Alembic migrations on start (`MIGRATE_ON_STARTUP=true`); nothing else
touches the schema.

## Header contract with the API

oauth2-proxy forwards `X-Forwarded-Email`, `X-Forwarded-User` and
`X-Forwarded-Preferred-Username` to upstreams (`pass-user-headers`). The API keys identity
on `X-Forwarded-Email`. Two flags break that silently: `prefer-email-to-user` (moves the
email into `-User` and drops `-Email`) and `set-xauthrequest` (only adds
`X-Auth-Request-*` to the browser response). Keep both off.

## Variables are the file, nothing more

The live variable set on each service must equal what `railway.ts` declares.
`railway config plan` will surface anything extra; treat that as a bug, not a warning. In
particular never keep a variable that merely repeats a code default, and never set one
just to trigger a build (push a matching commit or use `railway redeploy` instead).

## Changing things

- New environment variable → add it here (`preserve()` for secrets, a literal for
  config), set it in the dashboard, and mention it in `README.md`.
- New file a Dockerfile copies → extend that service's `WATCH` list or Railway will not
  rebuild on it.
- Bumping oauth2-proxy → change the image tag here; `railway config apply` rolls it.

## One thing to know about `api`

It runs a single uvicorn worker on purpose. The price-refresh cooldown in
`fastapi/app/api/routes/prices.py` is a module-level global, so a second worker or a
second replica would each keep their own and the 15-minute throttle would not hold. Scale
this service up only after that moves into Postgres.
