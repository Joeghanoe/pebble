"""
Migrate data from portfolio-backup.db (old schema) to portfolio.db (current schema).

Exchanges are skipped — they already exist with matching IDs.
Mappings:
  backup.assets               → current.asset         (identical columns)
  backup.transactions         → current.transaction   (realized_pnl dropped)
  backup.price_cache          → current.price_cache   (identical columns)
  backup.net_worth_snapshots  → current.net_worth_snapshot  (invested_eur defaults to 0)
"""

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
BACKUP = ROOT / ".data" / "portfolio-backup.db"
CURRENT = ROOT / ".data" / "portfolio.db"


def migrate():
    if not BACKUP.exists():
        print(f"ERROR: backup not found at {BACKUP}", file=sys.stderr)
        sys.exit(1)

    src = sqlite3.connect(BACKUP)
    dst = sqlite3.connect(CURRENT)
    src.row_factory = sqlite3.Row

    with dst:
        # ── assets ──────────────────────────────────────────────────────────
        assets = src.execute(
            "SELECT id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id FROM assets"
        ).fetchall()
        dst.executemany(
            "INSERT OR IGNORE INTO asset (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(r["id"], r["symbol"], r["name"], r["type"], r["exchange_id"], r["yahoo_ticker"], r["coingecko_id"])
             for r in assets],
        )
        print(f"  assets: {len(assets)} rows")

        # ── transactions ─────────────────────────────────────────────────────
        txs = src.execute(
            "SELECT id, asset_id, date, type, units, eur_amount, notes, source, external_id, deleted_at"
            " FROM transactions"
        ).fetchall()
        dst.executemany(
            'INSERT OR IGNORE INTO "transaction"'
            " (id, asset_id, date, type, units, eur_amount, notes, source, external_id, deleted_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(r["id"], r["asset_id"], r["date"], r["type"], r["units"], r["eur_amount"],
              r["notes"], r["source"], r["external_id"], r["deleted_at"])
             for r in txs],
        )
        print(f"  transactions: {len(txs)} rows")

        # ── price_cache ───────────────────────────────────────────────────────
        prices = src.execute(
            "SELECT asset_id, date, price_eur, exchange_rate FROM price_cache"
        ).fetchall()
        dst.executemany(
            "INSERT OR IGNORE INTO price_cache (asset_id, date, price_eur, exchange_rate)"
            " VALUES (?, ?, ?, ?)",
            [(r["asset_id"], r["date"], r["price_eur"], r["exchange_rate"]) for r in prices],
        )
        print(f"  price_cache: {len(prices)} rows")

        # ── net_worth_snapshots ───────────────────────────────────────────────
        snapshots = src.execute(
            "SELECT date, total_eur FROM net_worth_snapshots"
        ).fetchall()
        dst.executemany(
            "INSERT OR IGNORE INTO net_worth_snapshot (date, total_eur, invested_eur)"
            " VALUES (?, ?, 0)",
            [(r["date"], r["total_eur"]) for r in snapshots],
        )
        print(f"  net_worth_snapshots: {len(snapshots)} rows")

    src.close()
    dst.close()
    print("Done.")


if __name__ == "__main__":
    migrate()
