# Future work

Known gaps, roughly in the order they would start to hurt.

## Worth doing next

| Task | Why |
|---|---|
| **Restrict sign-in to one address at the proxy** | `OAUTH2_PROXY_EMAIL_DOMAINS` is `*` because the only way to name specific addresses is `--authenticated-emails-file`, and a stock image has nowhere to read one from. Today the Google consent screen's test-user list and `ALLOWED_EMAILS` on the api are the two gates. A small image that bakes in the file would make the proxy itself exact. |

## Toward multi-tenancy

Phases 1–3 of the plan made the codebase ready for it: a versioned API contract, no
process state (so replicas scale), exact numeric and date types, and a global
`instrument` table so market data is shared rather than per portfolio. What remains, in
order:

| Phase | What | Notes |
|---|---|---|
| **4. Identity** | oauth2-proxy `--pass-authorization-header`; the API verifies the ID token (JWKS, `iss`, `aud`, `exp`) and keys users on `sub`, not email. `user` and `membership` tables. | Stops relying on network position for identity. `ALLOWED_EMAILS` stays as the sign-up gate. |
| **5. Tenancy** | `tenant`, `tenant_id` on exchange, asset, transaction and both snapshot tables (snapshot primary keys gain it), Postgres row-level security, `SET LOCAL app.tenant_id` per request in `core/db.get_session`, a non-owner DB role without `BYPASSRLS`. Base currency per tenant. | RLS is what makes a missed `WHERE` in one of the raw queries a no-op instead of a leak. Needs a cross-tenant test suite over every route and raw query. Currency renames `eur_*` across the API and client, so it belongs here rather than as a deployment setting. |
| **6. Self-service** | Sign-up behind the allowlist, invites (owner / viewer), a JSON import endpoint matching `/api/v1/export/`, account deletion, per-tenant quotas. | |
| **7. Observability** | OpenTelemetry for FastAPI, SQLAlchemy and httpx, with `tenant_id` on spans and logs; upstream quota metrics per price provider. | |
| **8. Market-data service** | Extract `instrument`, `price_cache`, `clients/*` and the refresh job; publish price updates through an outbox into a ledger-side projection. | Only once tenant count makes shared price fetching a real load. |

Smaller follow-ups from phases 1–3:

- Python still does FIFO and valuation in `float`. Storage and SQL sums are exact now;
  moving the arithmetic to `Decimal` would make the computed P&L exact too.
- `ruff check` reports pre-existing findings and is not part of CI. Fixing them and adding
  it to `make test` would keep new code to the same standard.

## Deliberately not done

**Per-user scoping, for now.** Each instance is still single-tenant: no user table, no
`tenant_id` on any row. The security boundary is the proxy plus `ALLOWED_EMAILS`. Phases 4
and 5 above are the plan for changing that; until they land, sharing a deployment is not a
configuration change.

**Offline use.** The desktop shell was a full local stack (FastAPI sidecar, SQLite in the
app data directory) and is now a window onto the deployment. One ledger reachable from
the phone was the point; offline was the cost.

## Smaller things

- The transaction log's `Current Value` and `Profit/Loss` columns are hidden below 640px.
  A stacked card layout would show everything on a phone instead of dropping two columns.
- `/api/v1/export/` returns the whole ledger as JSON in one response. Fine at a personal
  scale; it would want streaming or pagination if the transaction count grew a lot.
- `scripts/import_local_data.py` loads a desktop SQLite file into the hosted Postgres,
  but nothing reads the JSON that `/api/v1/export/` produces, so an export still cannot be
  restored through the app. An import endpoint taking that JSON would close the loop and
  remove the need to expose Postgres on a public port at all.
- No frontend unit tests. The delete paths were verified by driving Chromium by hand;
  those checks are not committed anywhere.
