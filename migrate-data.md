# Data Migration from Old Database

Run these scripts against `portfolio-api/portfolio.db` to restore your data.

## How to run

```bash
sqlite3 portfolio-api/portfolio.db < migrate-data.sql
```

Or copy/paste each section into your preferred SQLite client.

---

## Step 1 — Exchanges

> The new DB seeds `(1, 'Crypto', 'crypto')` by default. Your old data used `(1, 'Bitvavo', 'crypto')`.
> The script below will **update** the existing row so all asset foreign keys remain valid.

```sql
UPDATE exchanges SET name = 'Bitvavo' WHERE id = 1;
INSERT OR IGNORE INTO exchanges (id, name, type) VALUES (2, 'Manual', 'manual');
```

---

## Step 2 — Assets

```sql
INSERT OR IGNORE INTO assets (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id) VALUES (1, 'VUAA', 'VUAA', 'etf', 2, 'VUAA.L', NULL);
INSERT OR IGNORE INTO assets (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id) VALUES (9, 'BTC', 'Bitcoin', 'crypto', 1, NULL, 'bitcoin');
INSERT OR IGNORE INTO assets (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id) VALUES (10, 'CARR', 'Carnomaly', 'crypto', 1, NULL, 'carnomaly');
INSERT OR IGNORE INTO assets (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id) VALUES (11, 'ETH', 'ETH', 'crypto', 1, NULL, 'ethereum');
INSERT OR IGNORE INTO assets (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id) VALUES (12, 'EXUS', 'EXUS', 'etf', 2, 'exus.de', NULL);
```

---

## Step 3 — Transactions

```sql
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (1, 1, '2025-04-28', 'buy', 2.70871165, 250.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (2, 10, '2026-01-24', 'buy', 10057172.0, 4000.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (4, 10, '2026-01-25', 'buy', 5000000.0, 2128.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (6, 9, '2026-02-26', 'buy', 0.0085638, 500.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (7, 9, '2026-03-25', 'buy', 0.00809375, 500.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (8, 1, '2025-05-23', 'buy', 4.63597466, 450.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (9, 1, '2025-06-25', 'buy', 4.4755881, 450.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (10, 1, '2025-07-25', 'buy', 2.88131796, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (11, 1, '2025-08-05', 'buy', 0.95220048, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (12, 1, '2025-08-12', 'buy', 0.95043843, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (13, 1, '2025-08-18', 'buy', 4.72787953, 500.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (14, 1, '2025-08-19', 'buy', 0.94719483, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (15, 1, '2025-08-25', 'buy', 3.78176669, 400.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (16, 1, '2025-08-26', 'buy', 0.94415422, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (17, 1, '2025-09-02', 'buy', 0.94562737, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (18, 1, '2025-09-09', 'buy', 0.94330812, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (19, 1, '2025-09-16', 'buy', 0.92919618, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (20, 1, '2025-09-23', 'buy', 0.91865409, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (21, 1, '2025-09-25', 'buy', 3.68210429, 400.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (22, 1, '2025-09-30', 'buy', 0.92114959, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (23, 1, '2025-10-07', 'buy', 0.90522395, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (24, 1, '2025-10-14', 'buy', 0.91336796, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (25, 1, '2025-10-21', 'buy', 0.90114526, 100.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (26, 1, '2025-10-30', 'buy', 3.0, 341.85, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (27, 1, '2025-11-25', 'buy', 2.68642508, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (28, 1, '2025-12-25', 'buy', 2.64911784, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (29, 1, '2026-02-13', 'sell', 15.65379285, 1650.0, -1650.0, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (32, 1, '2026-02-26', 'buy', 3.97287258, 450.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (33, 1, '2026-03-27', 'buy', 2.80751781, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (34, 11, '2026-01-24', 'buy', 2.342, 5825.23, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (35, 12, '2026-01-24', 'buy', 8.26530612, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (36, 12, '2026-02-13', 'buy', 46.06, 1733.46, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (37, 12, '2026-02-26', 'buy', 7.851716, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (38, 12, '2026-03-26', 'buy', 8.39143217, 300.0, NULL, NULL, 'manual', NULL, NULL);
INSERT OR IGNORE INTO transactions (id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at) VALUES (39, 9, '2025-01-01', 'buy', 0.12295548, 3847.03, NULL, NULL, 'manual', NULL, NULL);
```

---

## Step 4 — Net Worth Snapshots

> These will be regenerated automatically by the API on startup, but you can seed them to skip re-fetching historical prices.

```sql
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-04-30', 257.747980365368);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-05-31', 698.885044784913);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-06-30', 1124.76049510177);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-07-31', 1398.93286224187);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-08-31', 2569.6875496407);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-09-30', 3363.28563283907);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-10-31', 3907.54832827519);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-11-30', 4163.17562576656);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2025-12-31', 4415.25294562815);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2026-01-31', 29328.4724717197);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2026-02-28', 33775.4902686193);
INSERT OR IGNORE INTO net_worth_snapshots (date, total_eur) VALUES ('2026-03-31', 34924.0363346083);
```

---

## Summary

| Table | Rows |
|---|---|
| exchanges | 2 |
| assets | 5 |
| transactions | 39 |
| net_worth_snapshots | 12 |
