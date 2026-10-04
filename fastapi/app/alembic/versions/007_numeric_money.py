"""Store money, units and rates as numeric instead of double precision

Revision ID: 007
Revises: 006
Create Date: 2026-10-04

Every amount was a binary float. Sums over a ledger drift (`0.1 + 0.2` is
0.30000000000000004), and the drift lands in the cost basis and the net-worth series,
which are the numbers this app exists to get right. `numeric(28, 10)` stores exactly
what was written: eighteen integer digits, ten decimal places, enough for a satoshi
(1e-8) and for sub-cent token prices.

What happens to existing rows: each value is cast `::numeric` and rounded to ten
decimal places. That keeps every digit a float can meaningfully hold for these
magnitudes and drops binary noise in the eleventh place and beyond, so a stored
30000.000000000004 becomes 30000.0000000000. Nothing a person typed is lost.

Python keeps working in floats (see the numeric loader in app/core/db.py), so the
FIFO arithmetic and the API contract are unchanged; the gain is that storage and SQL
aggregates are exact. Moving the Python side to Decimal is a separate change.
"""

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None

COLUMNS = {
    "transaction": ("units", "eur_amount"),
    "price_cache": ("price_eur", "exchange_rate"),
    "net_worth_snapshot": ("total_eur", "invested_eur"),
    "position_snapshot": ("units_held", "price_eur", "value_eur", "invested_eur"),
}


def _alter(type_: str) -> None:
    for table, columns in COLUMNS.items():
        clauses = ", ".join(
            f'ALTER COLUMN "{col}" TYPE {type_} USING "{col}"::{type_}' for col in columns
        )
        op.execute(f'ALTER TABLE "{table}" {clauses}')


def upgrade() -> None:
    _alter("numeric(28, 10)")


def downgrade() -> None:
    _alter("double precision")
