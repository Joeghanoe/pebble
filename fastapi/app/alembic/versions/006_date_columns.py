"""Store dates as date and the soft-delete stamp as timestamptz

Revision ID: 006
Revises: 005
Create Date: 2026-10-04

Dates were 'YYYY-MM-DD' strings, inherited from SQLite. Every comparison in the raw SQL
relied on ISO dates sorting lexicographically, nothing stopped a malformed value from
being stored, and week and month buckets needed casts or substrings. Postgres has a
type for this.

What happens to existing rows: `date::date` parses each value. Every row written since
the move to Postgres went through the `IsoDate` pattern check, and
scripts/import_local_data.py refuses malformed dates, so the cast has nothing to
reject; if it ever did, the whole migration rolls back and the ledger is untouched.
`deleted_at` holds ISO 8601 with an offset, which `::timestamptz` reads as written.

The application still sees strings: the column types in app/models.py convert at the
boundary, so services, the API and the generated client are unchanged.
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None

DATE_TABLES = ("transaction", "price_cache", "net_worth_snapshot", "position_snapshot")


def upgrade() -> None:
    for table in DATE_TABLES:
        op.execute(f'ALTER TABLE "{table}" ALTER COLUMN date TYPE date USING date::date')
    op.execute(
        'ALTER TABLE "transaction" '
        "ALTER COLUMN deleted_at TYPE timestamptz USING deleted_at::timestamptz"
    )


def downgrade() -> None:
    for table in DATE_TABLES:
        op.execute(
            f'ALTER TABLE "{table}" ALTER COLUMN date TYPE varchar(10) '
            "USING to_char(date, 'YYYY-MM-DD')"
        )
    op.execute(
        'ALTER TABLE "transaction" ALTER COLUMN deleted_at TYPE varchar(40) '
        """USING to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')"""
    )
