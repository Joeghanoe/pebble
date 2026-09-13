# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]>=3.2"]
# ///
"""Load a local desktop-era SQLite portfolio into the hosted Postgres.

The desktop build kept everything in a SQLite file under the app data directory.
This copies that file's contents into the deployment's Postgres, ids and all, so
the hosted app opens on the same ledger.

    export DATABASE_URL='postgresql://postgres:PASSWORD@HOST:PORT/railway'
    uv run scripts/import_local_data.py ~/Library/Application\\ Support/com.pebble.desktop/portfolio.db

Reads and reports only, until you pass --write. Nothing is a surprise on a first run.

Needs the Postgres to be reachable from this machine, which means the service has a
TCP proxy and you are using that public endpoint — the internal DATABASE_URL resolves
only inside Railway. See .railway/README.md.

Two things this handles that a naive INSERT loop gets wrong:

1. Migration 001 seeds exchanges 1 (Crypto) and 2 (Manual) into BOTH databases, so a
   plain insert collides on the primary key immediately. Rows are upserted by id;
   the local file wins.

2. Inserting explicit ids does not advance a Postgres sequence. Leave them and the
   next position you add in the app collides on the primary key — the same fault
   migration 002 exists to repair. Every sequence is realigned at the end.

It also checks the values SQLite never enforced. That engine ignores declared column
widths and had no enum for `type`, so a file can hold rows Postgres will reject; they
are reported up front rather than failing the import halfway through.
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

import psycopg

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# The live schema, in foreign-key order: exchange before asset before the rest.
# (table, columns, primary key) — the primary key is what an upsert conflicts on.
TABLES: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    ("exchange", ("id", "name", "type"), ("id",)),
    ("asset", ("id", "symbol", "name", "type", "exchange_id", "yahoo_ticker", "coingecko_id"), ("id",)),
    ("transaction", ("id", "asset_id", "date", "type", "units", "eur_amount", "notes",
                     "source", "external_id", "deleted_at"), ("id",)),
    ("price_cache", ("asset_id", "date", "price_eur", "exchange_rate"), ("asset_id", "date")),
    ("net_worth_snapshot", ("date", "total_eur", "invested_eur"), ("date",)),
    ("position_snapshot", ("date", "asset_id", "units_held", "price_eur", "value_eur",
                           "invested_eur"), ("date", "asset_id")),
]

# Tables whose id comes from a sequence. Realigned after the load.
SEQUENCED = ("exchange", "asset", "transaction")

# What Postgres will enforce and SQLite did not.
ENUMS = {
    ("exchange", "type"): {"crypto", "broker", "manual"},
    ("asset", "type"): {"crypto", "etf", "cash", "stock"},
    ("transaction", "type"): {"buy", "sell"},
}
WIDTHS = {
    ("exchange", "name"): 255, ("exchange", "type"): 20,
    ("asset", "symbol"): 50, ("asset", "name"): 255, ("asset", "type"): 20,
    ("asset", "yahoo_ticker"): 50, ("asset", "coingecko_id"): 100,
    ("transaction", "date"): 10, ("transaction", "type"): 10,
    ("transaction", "source"): 20, ("transaction", "deleted_at"): 40,
    ("price_cache", "date"): 10,
    ("net_worth_snapshot", "date"): 10,
    ("position_snapshot", "date"): 10,
}
DATE_COLUMNS = {
    ("transaction", "date"), ("price_cache", "date"),
    ("net_worth_snapshot", "date"), ("position_snapshot", "date"),
}


def read_sqlite(path: Path) -> dict[str, list[dict]]:
    if not path.exists():
        sys.exit(f"No SQLite file at {path}")

    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    present = {
        r["name"]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }

    # The pre-rewrite schema used plural names and a realized_pnl column.
    if "transactions" in present and "transaction" not in present:
        sys.exit(
            f"{path} uses the old plural-table schema (assets, transactions, ...).\n"
            "Run scripts/migrate-from-backup.py against it first to bring it to the "
            "current shape, then point this script at the result."
        )

    data: dict[str, list[dict]] = {}
    for table, columns, _pk in TABLES:
        if table not in present:
            data[table] = []
            continue
        quoted = ", ".join(f'"{c}"' for c in columns)
        rows = conn.execute(f'SELECT {quoted} FROM "{table}"').fetchall()
        data[table] = [dict(r) for r in rows]
    conn.close()
    return data


def check(data: dict[str, list[dict]]) -> list[str]:
    """Values Postgres will refuse. SQLite accepted all of them."""
    problems: list[str] = []

    for table, columns, _pk in TABLES:
        for i, row in enumerate(data[table]):
            for col in columns:
                value = row[col]
                if value is None:
                    continue

                allowed = ENUMS.get((table, col))
                if allowed and value not in allowed:
                    problems.append(
                        f"{table}[{i}].{col} = {value!r} is not one of {sorted(allowed)}"
                    )

                width = WIDTHS.get((table, col))
                if width and isinstance(value, str) and len(value) > width:
                    problems.append(
                        f"{table}[{i}].{col} is {len(value)} chars, column holds {width}: {value!r}"
                    )

                if (table, col) in DATE_COLUMNS and not ISO_DATE.match(str(value)):
                    problems.append(f"{table}[{i}].{col} = {value!r} is not YYYY-MM-DD")

    # Foreign keys, which the file may violate if it was edited by hand.
    exchange_ids = {r["id"] for r in data["exchange"]}
    asset_ids = {r["id"] for r in data["asset"]}
    for i, row in enumerate(data["asset"]):
        if row["exchange_id"] not in exchange_ids:
            problems.append(f"asset[{i}] ({row['symbol']}) points at missing exchange {row['exchange_id']}")
    for table in ("transaction", "price_cache", "position_snapshot"):
        for i, row in enumerate(data[table]):
            if row["asset_id"] not in asset_ids:
                problems.append(f"{table}[{i}] points at missing asset {row['asset_id']}")

    return problems


def load(conn: psycopg.Connection, data: dict[str, list[dict]], replace: bool) -> None:
    with conn.cursor() as cur:
        if replace:
            cur.execute(
                'TRUNCATE "transaction", price_cache, position_snapshot, '
                "net_worth_snapshot, asset, exchange RESTART IDENTITY CASCADE"
            )
            print("  truncated the target tables")

        for table, columns, pk in TABLES:
            rows = data[table]
            if not rows:
                continue
            cols = ", ".join(f'"{c}"' for c in columns)
            slots = ", ".join(["%s"] * len(columns))
            updates = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in columns if c not in pk)
            conflict = ", ".join(f'"{c}"' for c in pk)
            # DO UPDATE so a second run corrects rows instead of failing on the
            # seeded exchanges; DO NOTHING would silently keep stale values.
            action = f"DO UPDATE SET {updates}" if updates else "DO NOTHING"
            cur.executemany(
                f'INSERT INTO "{table}" ({cols}) VALUES ({slots}) '
                f"ON CONFLICT ({conflict}) {action}",
                [tuple(r[c] for c in columns) for r in rows],
            )
            print(f"  {table}: {len(rows)} rows")

        # The point of the whole exercise. Without this the next insert from the app
        # reuses an id that is already taken.
        for table in SEQUENCED:
            cur.execute(
                f"""
                SELECT setval(
                  pg_get_serial_sequence('"{table}"', 'id'),
                  COALESCE((SELECT MAX(id) FROM "{table}"), 1),
                  (SELECT MAX(id) IS NOT NULL FROM "{table}")
                )
                """
            )
        print(f"  realigned sequences: {', '.join(SEQUENCED)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sqlite_path", type=Path, help="the desktop app's portfolio.db")
    parser.add_argument("--write", action="store_true",
                        help="actually write. Without it the script only reports.")
    parser.add_argument("--replace", action="store_true",
                        help="empty the target tables first, for an exact mirror of the file. "
                             "Without it rows are upserted and anything already in Postgres "
                             "but absent from the file is left alone.")
    parser.add_argument("--force", action="store_true",
                        help="import even if values fail the checks below. They will "
                             "probably be rejected by Postgres anyway.")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit(
            "DATABASE_URL is not set. Use the PUBLIC endpoint from the Postgres service's\n"
            "TCP proxy — the internal one resolves only inside Railway:\n"
            "  export DATABASE_URL='postgresql://postgres:PASSWORD@HOST:PORT/railway'"
        )

    print(f"Reading {args.sqlite_path}")
    data = read_sqlite(args.sqlite_path)
    for table, _c, _pk in TABLES:
        print(f"  {table}: {len(data[table])} rows")

    problems = check(data)
    if problems:
        print(f"\n{len(problems)} value(s) Postgres will not accept:")
        for p in problems[:25]:
            print(f"  - {p}")
        if len(problems) > 25:
            print(f"  ... and {len(problems) - 25} more")
        if not args.force:
            sys.exit("\nNothing written. Fix these in the SQLite file, or pass --force.")
        print("\n--force given; continuing anyway.")

    if not args.write:
        print("\nDry run. Re-run with --write to import"
              f"{' (replacing the target tables)' if args.replace else ''}.")
        return

    print(f"\nConnecting to Postgres{' [REPLACE]' if args.replace else ' [upsert]'}")
    # One transaction: a failure halfway leaves the hosted ledger untouched.
    with psycopg.connect(database_url) as conn:
        load(conn, data, replace=args.replace)
        conn.commit()

        with conn.cursor() as cur:
            print("\nIn Postgres now:")
            for table, _c, _pk in TABLES:
                cur.execute(f'SELECT count(*) FROM "{table}"')
                print(f"  {table}: {cur.fetchone()[0]} rows")

    print("\nDone.")


if __name__ == "__main__":
    main()
