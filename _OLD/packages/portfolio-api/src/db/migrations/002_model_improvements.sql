-- Migration: 002_model_improvements.sql
--
-- 1. Add 'stock' to asset types (requires table recreation: SQLite can't ALTER CHECK constraints)
-- 2. Remove realized_pnl from transactions (ALTER TABLE DROP COLUMN — no recreation needed)
-- 3. Add position_snapshots for per-asset daily tracking
-- 4. Store invested_eur directly in net_worth_snapshots (was an expensive correlated subquery)
-- 5. Backfill both snapshot tables from existing price_cache + transaction history
--
-- FK enforcement is disabled at the connection level by the migration runner before
-- this transaction starts, so DROP TABLE on a parent table is safe.

-- Recreate assets with 'stock' added to the type constraint
CREATE TABLE assets_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('crypto', 'etf', 'cash', 'stock')),
  exchange_id INTEGER NOT NULL REFERENCES exchanges(id),
  yahoo_ticker TEXT,
  coingecko_id TEXT
);

INSERT INTO assets_v2 (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id)
SELECT id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id FROM assets;

DROP TABLE assets;
ALTER TABLE assets_v2 RENAME TO assets;

-- Drop realized_pnl column from transactions.
-- ALTER TABLE DROP COLUMN avoids recreating the table and all FK issues.
-- realized_pnl is now computed on-read via FIFO and returned in API responses.
ALTER TABLE transactions DROP COLUMN realized_pnl;

-- Per-asset daily position snapshots
CREATE TABLE IF NOT EXISTS position_snapshots (
  date TEXT NOT NULL,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  units_held REAL NOT NULL,
  price_eur REAL NOT NULL,
  value_eur REAL NOT NULL,
  invested_eur REAL NOT NULL,
  PRIMARY KEY (date, asset_id)
);

-- Backfill position_snapshots from existing price_cache + transaction history.
-- Only inserts rows where the position was actively held (units_held > 0).
INSERT OR IGNORE INTO position_snapshots (date, asset_id, units_held, price_eur, value_eur, invested_eur)
SELECT
  pc.date,
  pc.asset_id,
  (SELECT COALESCE(SUM(CASE WHEN t.type = 'buy' THEN t.units ELSE -t.units END), 0)
   FROM transactions t
   WHERE t.asset_id = pc.asset_id AND t.date <= pc.date AND t.deleted_at IS NULL) AS units_held,
  pc.price_eur,
  (SELECT COALESCE(SUM(CASE WHEN t.type = 'buy' THEN t.units ELSE -t.units END), 0)
   FROM transactions t
   WHERE t.asset_id = pc.asset_id AND t.date <= pc.date AND t.deleted_at IS NULL) * pc.price_eur AS value_eur,
  (SELECT COALESCE(SUM(CASE WHEN t.type = 'buy' THEN t.eur_amount ELSE -t.eur_amount END), 0)
   FROM transactions t
   WHERE t.asset_id = pc.asset_id AND t.date <= pc.date AND t.deleted_at IS NULL) AS invested_eur
FROM price_cache pc
WHERE (
  SELECT COALESCE(SUM(CASE WHEN t.type = 'buy' THEN t.units ELSE -t.units END), 0)
  FROM transactions t
  WHERE t.asset_id = pc.asset_id AND t.date <= pc.date AND t.deleted_at IS NULL
) > 0;

-- Add invested_eur as a stored column to net_worth_snapshots
ALTER TABLE net_worth_snapshots ADD COLUMN invested_eur REAL NOT NULL DEFAULT 0;

-- Backfill invested_eur for existing snapshot rows
UPDATE net_worth_snapshots
SET invested_eur = (
  SELECT COALESCE(SUM(CASE WHEN t.type = 'buy' THEN t.eur_amount ELSE -t.eur_amount END), 0)
  FROM transactions t
  WHERE t.date <= net_worth_snapshots.date AND t.deleted_at IS NULL
);

-- Populate net_worth_snapshots for all days in position_snapshots not yet covered.
-- Converts the table from sparse/monthly to daily wherever price data already exists.
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur, invested_eur)
SELECT date, SUM(value_eur) AS total_eur, SUM(invested_eur) AS invested_eur
FROM position_snapshots
GROUP BY date;
