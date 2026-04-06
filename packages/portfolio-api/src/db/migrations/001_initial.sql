-- Migration: 001_initial.sql
-- Creates all tables for the portfolio tracker

CREATE TABLE
IF NOT EXISTS schema_migrations
(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE
IF NOT EXISTS exchanges
(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK
(type IN
('crypto', 'broker', 'manual'))
);

CREATE TABLE
IF NOT EXISTS assets
(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK
(type IN
('crypto', 'etf', 'cash')),
  exchange_id INTEGER NOT NULL REFERENCES exchanges
(id),
  yahoo_ticker TEXT,
  coingecko_id TEXT
);

CREATE TABLE
IF NOT EXISTS transactions
(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets
(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK
(type IN
('buy', 'sell')),
  units REAL NOT NULL,
  eur_amount REAL NOT NULL,
  realized_pnl REAL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK
(source IN
('manual', 'imported')),
  external_id TEXT,
  deleted_at TEXT
);

CREATE TABLE
IF NOT EXISTS price_cache
(
  asset_id INTEGER NOT NULL REFERENCES assets
(id),
  date TEXT NOT NULL,
  price_eur REAL NOT NULL,
  exchange_rate REAL NOT NULL,
  PRIMARY KEY
(asset_id, date)
);

CREATE TABLE
IF NOT EXISTS net_worth_snapshots
(
  date TEXT PRIMARY KEY,
  total_eur REAL NOT NULL
);

-- Seed default exchanges
INSERT OR
IGNORE INTO exchanges (id, name, type)
VALUES
  (1, 'Crypto', 'crypto'),
  (2, 'Manual', 'manual');
