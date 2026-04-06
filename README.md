# Portfolio Tracker — Project Plan

**Platform:** macOS  
**Runtime:** Bun  
**Storage:** SQLite via `bun:sqlite`  
**Status:** Spec locked, ready to build

---

## 1. What it is

A locally stored desktop investment tracker that replaces an Excel setup. It tracks positions across crypto and ETFs, fetches live prices, converts currencies, and shows portfolio value over time — including sells.

Key improvements over the current Excel approach:

- Portfolio value over time, calculated automatically each month
- Sell tracking with FIFO cost basis and realized P&L
- Live price fetching per asset type (crypto vs ETF)
- One view per asset, with transaction log and charts
- No cloud dependency — everything lives on your machine

---

## 2. App shell

No Electron. The app runs as a local Bun HTTP server and opens in a dedicated window using Chrome's `--app` flag — no browser chrome, behaves like a native window.

**Start script:**

```bash
bun run src/server.ts &
open -na "Google Chrome" --args --app=http://localhost:3000 --window-size=1280,800
```

Add this as an `.app` bundle via Automator or a simple shell script alias so it opens like any other macOS app. No app store, no signing required.

---

## 3. Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun | Native SQLite, native secrets, fast bundler |
| Backend server | `Bun.serve` | Built-in HTTP server, no Express needed |
| Database | `bun:sqlite` | Native, no native module rebuild step |
| Frontend | React + TypeScript | Bundled and served by Bun directly |
| UI | shadcn/ui + Tailwind | Clean native-feeling components |
| Charts | Recharts | Lightweight, composable |
| Secret storage | `Bun.secrets` | macOS Keychain via Bun native API |
| Crypto prices (live) | Bitvavo API | Today's price only |
| Crypto prices (historical) | CoinGecko `/coins/{id}/history` | Arbitrary past dates — requires free Demo API key |
| ETF prices | Yahoo Finance (unofficial JSON) | Free, no auth needed |
| ETF fallback | Manual price entry | If Yahoo breaks |
| Currency | frankfurter.app — EUR/USD | Open source, ECB data, reliable |

---

## 4. Data model

### schema_migrations

```
id              integer   primary key
filename        text      e.g. "001_initial.sql"
applied_at      text      ISO timestamp
```

On every app open the migration runner checks this table and applies any unapplied files in filename order. Never re-runs applied migrations.

### exchanges

```
id              integer   primary key
name            text      e.g. "Bitvavo", "Manual"
type            text      crypto | broker | manual
```

API keys are never stored in the database. They live in macOS Keychain via `Bun.secrets` — see section 5.

### assets

```
id              integer   primary key
symbol          text      e.g. "BTC", "VUAA"
name            text      e.g. "Bitcoin", "Vanguard S&P 500 UCITS ETF"
type            text      crypto | etf | cash
exchange_id     integer   foreign key → exchanges
yahoo_ticker    text      nullable — for ETF price fetching
coingecko_id    text      nullable — for historical + fallback crypto prices
```

### transactions

```
id              integer   primary key
asset_id        integer   foreign key → assets
date            text      ISO date (YYYY-MM-DD)
type            text      buy | sell
units           real      always positive
eur_amount      real      always positive — direction from type
realized_pnl    real      nullable — populated on sells via FIFO
notes           text      nullable
source          text      manual | imported (default: manual)
external_id     text      nullable — for future exchange import deduplication
deleted_at      text      nullable — soft delete, no hard deletes
```

### price_cache

```
asset_id        integer   foreign key → assets
date            text      ISO date
price_eur       real
exchange_rate   real      EUR/USD rate used on that day
primary key: (asset_id, date)
```

### net_worth_snapshots

```
date            text      ISO date — always last day of the month
total_eur       real
```

---

## 5. Secret storage

API keys are stored in macOS Keychain using `Bun.secrets`. They are never written to SQLite, `.env` files, or source control.

```typescript
import { secrets } from "bun";

const SERVICE = "com.portfolio-tracker";

// Store a key (called once from Exchange Settings UI)
await secrets.set({
  service: SERVICE,
  name: "bitvavo-api-key",
  value: userInputKey,
});

// Retrieve before a price fetch
const apiKey = await secrets.get({
  service: SERVICE,
  name: "bitvavo-api-key",
});

// Delete when exchange is removed
await secrets.delete({
  service: SERVICE,
  name: "bitvavo-api-key",
});
```

Keys managed this way:

| Secret name | Used for |
|---|---|
| `bitvavo-api-key` | Bitvavo live price + future import |
| `coingecko-demo-key` | CoinGecko historical crypto prices |

`Bun.secrets` is marked experimental — if it breaks in a future Bun version, `keytar` (macOS Keychain via Node-API) is the drop-in fallback.

---

## 6. API architecture

The Bun backend exposes a typed local REST API. The React frontend calls it via `fetch`. No IPC bridge needed — this replaces the Electron `contextBridge` pattern entirely and is simpler.

**Route structure:**

```
GET    /api/positions
GET    /api/positions/:id/transactions
POST   /api/transactions
PUT    /api/transactions/:id
DELETE /api/transactions/:id        (soft delete — sets deleted_at)
GET    /api/net-worth
POST   /api/prices/refresh
GET    /api/export                  (triggers .db file download)
```

All routes return typed JSON. All external API responses (Yahoo, CoinGecko, frankfurter.app) are validated with `zod` at the service boundary before being used anywhere. No `any` type anywhere in the codebase — use `unknown` or a specific type.

**Price fetch result — discriminated union:**

```typescript
type PriceResult =
  | { status: "ok";          priceEur: number; date: string }
  | { status: "stale";       priceEur: number; lastKnownDate: string }
  | { status: "unavailable" }
```

The UI reads `status` to decide what to render. No try-catch in render paths — errors are typed state.

---

## 7. Business logic

### Price fetching

**Live price (today):**

```
For each active asset:
  If type = crypto
    → Fetch from Bitvavo API using key from Bun.secrets
    → If Bitvavo fails: fetch from CoinGecko using key from Bun.secrets
  If type = etf
    → Fetch from Yahoo Finance
    → If Yahoo fails: return { status: "unavailable" }
  Convert to EUR using today's rate from frankfurter.app
  Store in price_cache for today
```

**Historical prices (transaction rows):**

```
On load, check price_cache for each transaction date
If missing:
  If type = crypto → CoinGecko /coins/{id}/history?date={date}
  If type = etf    → Yahoo Finance historical endpoint
  Enqueue in background queue — throttled to 50 requests/min
  Return { status: "stale" } with skeleton UI until resolved
  On success: store in price_cache, return { status: "ok" }
```

Bitvavo is never used for historical dates. CoinGecko handles all historical crypto lookups.

### Weekend and holiday prices

If no price exists for a given date (market closed), use the most recent available trading day before that date. Record the actual date used in price_cache.

### Missing price — UI state

If today's price fetch fails and no cached price exists:

- Return `{ status: "stale", priceEur: lastKnown, lastKnownDate }` if a past price exists
- Return `{ status: "unavailable" }` if no price has ever been cached
- Dashboard renders a clock icon + last known date on stale rows
- Never renders zero or null as a price

### FIFO cost basis

When a sell is added, or any transaction is edited or deleted:

1. Pull all buy transactions for that asset: `ORDER BY date ASC, id ASC`
   — `id` is the tiebreaker for same-date buys
2. Walk through oldest lots first until sell units are covered
3. Calculate cost basis from those lots
4. Store realized P&L on the sell row

Recalculated on every transaction change.

### Month-end snapshots

On every app open:

```
Find all month-end dates since earliest transaction date
For each month-end date with no snapshot:
  Sum (units held × price_eur) for all assets on that date
  If all prices available in cache: write snapshot
  If any price missing: skip — do not write partial snapshot
```

---

## 8. Screens

### 8.1 Dashboard

- Summary cards: total invested / current value / overall P&L %
- Position table: symbol, exchange badge, total invested, current value, P&L % — click to open detail. Stale badge where applicable
- Net worth chart: monthly snapshots over time (Recharts line chart)
- Last updated: timestamp of most recent price fetch

### 8.2 Position detail

- Header: symbol, exchange badge, current price, last-fetched timestamp, refresh button
- Data dashboard card: total units held, total invested, current value, average P&L %, realized P&L
- Transaction log table — inline editable rows:
  - Date / Type / Units / EUR amount / Current value / P&L / Notes
  - Add row button at bottom
  - Sell rows show realized P&L calculated via FIFO
  - Skeleton loaders on rows awaiting historical price fetch
- Charts: value over time (monthly) and investing frequency (scatter — date vs EUR amount)

### 8.3 Add / edit position

- Select exchange → symbol lookup resolves from that exchange
- For ETFs: enter Yahoo ticker once (stored on asset)
- Name and type auto-filled where possible

### 8.4 Monthly breakdown

- Table: one row per month per position
- Columns: month / units held / price that month / EUR value / P&L vs invested
- Totals row per month

### 8.5 Exchange settings

- One card per exchange
- API key input — written to `Bun.secrets`, never to the DB
- Price source status: last successful fetch + any errors

### 8.6 Export

- Button: "Export database file"
- Opens native macOS save dialog via `showSaveFilePicker` or a `/api/export` download
- Copies the `.db` file to the chosen location
- Included in v1 — the SQLite file is the only copy of your data

---

## 9. Testing

Use `bun test` (built-in). Three areas require unit tests.

### FIFO calculation (`src/services/fifo.ts`)

```typescript
// Examples of required test cases:
calculateFifo_singleBuySingleSell_returnsCorrectPnl
calculateFifo_partialSellAcrossMultipleLots_returnsCorrectRealizedPnl
calculateFifo_sameDateBuys_useInsertionOrderAsTiebreaker
calculateFifo_editEarlierBuy_recalculatesDownstreamSells
calculateFifo_deleteBuyUsedInSell_recalculatesCorrectly
```

### Price fetching service (`src/services/prices.ts`)

External HTTP clients are injected — not instantiated inside the service. This allows mocking at the boundary.

```typescript
// Constructor injection pattern:
class PriceService {
  constructor(
    private readonly bitvavo: BitvavoClient,
    private readonly coingecko: CoinGeckoClient,
    private readonly yahoo: YahooClient,
    private readonly currency: CurrencyClient,
  ) {}
}

// Test cases:
fetchLivePrice_bitvavoCryptoSuccess_returnsOkResult
fetchLivePrice_bitvavoCryptoFails_fallsBackToCoinGecko
fetchLivePrice_allCryptoSourcesFail_returnsUnavailable
fetchLivePrice_yahooEtfFails_returnsUnavailable
fetchHistoricalPrice_missingFromCache_fetchesAndStores
fetchLivePrice_usdDenominatedEtf_convertsToEurCorrectly
```

### Migration runner (`src/db/runner.ts`)

```typescript
migrationRunner_firstRun_appliesAllMigrations
migrationRunner_secondRun_skipsAlreadyAppliedMigrations
migrationRunner_newMigrationAdded_appliesOnlyNewFile
```

---

## 10. Build order

| Step | What | Notes |
|---|---|---|
| 1 | Bun project scaffold + `bun:sqlite` wiring | No native module rebuild needed — `bun:sqlite` is built in |
| 2 | Data model + migration runner | `schema_migrations` table, startup runner, all tables |
| 3 | Price fetching service — spike test | Validate Yahoo Finance + CoinGecko (Demo key) + frankfurter.app return expected data. Do this before building any UI |
| 4 | Dashboard screen | First thing a user sees |
| 5 | Position detail + transaction log | Core daily-use screen |
| 6 | Monthly breakdown | Depends on price_cache being populated |
| 7 | Exchange settings + export | Polish — not blocking earlier steps |

---

## 11. Decisions locked

| Topic | Decision |
|---|---|
| App shell | Bun server + Chrome `--app` window, no Electron |
| ETF price source | Yahoo Finance — manual entry fallback |
| Crypto price (live) | Bitvavo API — CoinGecko fallback |
| Crypto price (historical) | CoinGecko always — Bitvavo does not serve arbitrary past dates |
| CoinGecko auth | Free Demo API key required — open endpoint removed in 2024 |
| Secret storage | `Bun.secrets` → macOS Keychain. Fallback: `keytar` if Bun.secrets breaks |
| Currency source | frankfurter.app — ECB data, open source, reliable |
| Currency base | EUR always |
| Cost basis method | FIFO — recalculated on every transaction change |
| FIFO tiebreaker | `ORDER BY date ASC, id ASC` for same-date buys |
| Sell column name | `eur_amount` — direction from `type` |
| Price result type | Discriminated union: `ok / stale / unavailable` |
| Missing current price | Show last known price with stale indicator — never zero or null |
| Soft delete | `deleted_at` on transactions — no hard deletes |
| Weekend / holiday prices | Use last available trading day before that date |
| Historical price fetching | Background queue, throttled to 50/min, skeleton UI |
| Month-end backfill | On app open — skipped if no price in cache |
| Future exchange import | `source` + `external_id` on transactions already in schema |
| Existing data | Fresh start — re-enter manually |
| TypeScript | No `any` — `unknown` or specific type everywhere |
| External API responses | Validated with `zod` at service boundary |
| Error handling | Typed discriminated union state — no try-catch in render paths |
| Service dependencies | Constructor-injected — never instantiated inside business logic |
| Database backup | Export button in v1 — copies `.db` file to user-chosen location |

---

## 12. Out of scope (v1)

- Exchange API auto-import of transactions
- Tax reporting or cost basis exports
- Multi-currency portfolios (EUR is always the base)
- Mobile or web version
- Push or scheduled notifications
- Cloud sync

---

## 13. Folder structure

```
portfolio-tracker/
├── src/
│   ├── server.ts              # Bun.serve entry point — registers all routes
│   ├── routes/
│   │   ├── positions.ts       # GET /api/positions
│   │   ├── transactions.ts    # GET/POST/PUT/DELETE /api/transactions
│   │   ├── prices.ts          # POST /api/prices/refresh
│   │   ├── net-worth.ts       # GET /api/net-worth
│   │   └── export.ts          # GET /api/export
│   ├── services/
│   │   ├── prices.ts          # PriceService — injected clients, returns PriceResult
│   │   ├── currency.ts        # frankfurter.app — EUR/USD, cached per day
│   │   └── fifo.ts            # FIFO cost basis — pure function, fully testable
│   ├── db/
│   │   ├── migrations/        # 001_initial.sql, 002_*.sql etc.
│   │   ├── runner.ts          # schema_migrations check + apply on startup
│   │   └── queries/           # Typed query functions per entity
│   ├── clients/
│   │   ├── bitvavo.ts         # BitvavoClient — reads key from Bun.secrets
│   │   ├── coingecko.ts       # CoinGeckoClient — reads key from Bun.secrets
│   │   ├── yahoo.ts           # YahooClient
│   │   └── frankfurter.ts     # FrankfurterClient
│   ├── types/
│   │   ├── api.ts             # Shared request/response types
│   │   └── price.ts           # PriceResult discriminated union
│   └── frontend/
│       ├── components/        # shadcn/ui + custom components
│       └── screens/
│           ├── Dashboard/
│           ├── PositionDetail/
│           ├── MonthlyBreakdown/
│           └── Settings/
├── tests/
│   ├── fifo.test.ts
│   ├── prices.test.ts
│   └── runner.test.ts
├── bunfig.toml
└── package.json
```

---

## 14. Key dependencies

```json
{
  "react": "^19",
  "typescript": "^6",
  "tailwindcss": "^4",
  "@radix-ui/react-*": "latest",
  "recharts": "^2",
  "date-fns": "^3",
  "zod": "^3"
}
```

No `better-sqlite3`. No `electron`. No `electron-rebuild`.  
SQLite and secrets are Bun native — zero extra dependencies for either.

`zod` validates all external API responses at the service boundary. The inferred `zod` type flows through the rest of the codebase — no `any`.

---

*Spec locked. Start with Step 1: `bun init` + `bun:sqlite` wiring + migration runner.*