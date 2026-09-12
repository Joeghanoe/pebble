# Future work

Known gaps, roughly in the order they would start to hurt.

## Worth doing next

| Task | Why |
|---|---|
| **Move the price-refresh cooldown into Postgres** | It is a module-level global in `api/routes/prices.py`, so the 15-minute throttle is per process. That pins the api service to one uvicorn worker and one replica. Until it moves, scaling up silently multiplies the rate at which Pebble hits CoinGecko and Yahoo. |
| **Snapshot backfill on a schedule** | `services/snapshots.py` can build the net-worth history, but nothing calls it periodically, so the dashboard chart only has points for days something happened to run. A Railway cron hitting an authenticated endpoint would fill it. |
| **Shorten the FastAPI operation ids** | They generate client methods like `deleteTransactionApiTransactionsTxIdDeleteDelete`. A `generate_unique_id_function` on the app would fix every name at once, at the cost of one large mechanical diff through the frontend. |
| **Restrict sign-in to one address at the proxy** | `OAUTH2_PROXY_EMAIL_DOMAINS` is `*` because the only way to name specific addresses is `--authenticated-emails-file`, and a stock image has nowhere to read one from. Today the Google consent screen's test-user list and `ALLOWED_EMAILS` on the api are the two gates. A small image that bakes in the file would make the proxy itself exact. |

## Deliberately not done

**Per-user scoping.** Pebble is single-tenant: no user table, no `user_id` on any row,
every query unscoped. That is a decision, not an omission — the security boundary is the
proxy plus `ALLOWED_EMAILS`, and adding scoping now would be premature for a personal
ledger. It does mean sharing the deployment is not a configuration change: it needs a
migration over live financial data and a scope on every query and raw SQL statement,
which is the kind of change that leaks someone's portfolio if one query is missed.

**Offline use.** The desktop shell was a full local stack (FastAPI sidecar, SQLite in the
app data directory) and is now a window onto the deployment. One ledger reachable from
the phone was the point; offline was the cost.

## Smaller things

- The transaction log's `Current Value` and `Profit/Loss` columns are hidden below 640px.
  A stacked card layout would show everything on a phone instead of dropping two columns.
- `/api/export/` returns the whole ledger as JSON in one response. Fine at a personal
  scale; it would want streaming or pagination if the transaction count grew a lot.
- There is no import. `scripts/migrate-from-backup.py` exists for the original SQLite
  data but nothing reads the JSON that `/api/export/` produces, so an export cannot be
  restored through the app.
- No frontend unit tests. The delete paths were verified by driving Chromium by hand;
  those checks are not committed anywhere.
