"""Realign identity sequences after the seeded exchanges

Revision ID: 002
Revises: 001
Create Date: 2026-09-12

Migration 001 seeds the two default exchanges with explicit ids:

    INSERT INTO exchange (id, name, type) VALUES (1, 'Crypto', 'crypto')

On SQLite that is harmless. On Postgres an explicit id bypasses the column's sequence
entirely, so the sequence is still parked at 1 and the first exchange a user creates
gets id 1 again -- a duplicate key violation on the primary key. Nothing in the app
recovers from that; adding an exchange simply 500s until the sequence is moved.

Realigning here rather than editing 001 keeps the already-applied history intact.
The statement is idempotent and safe to re-run.
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

# Tables whose primary key comes from a sequence. Only `exchange` is seeded today, but
# realigning all three costs nothing and covers any future seed.
_SEQUENCED_TABLES = ("exchange", "asset", "transaction")


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in _SEQUENCED_TABLES:
        op.execute(
            f"""
            SELECT setval(
              pg_get_serial_sequence('"{table}"', 'id'),
              COALESCE((SELECT MAX(id) FROM "{table}"), 1),
              (SELECT MAX(id) IS NOT NULL FROM "{table}")
            )
            """
        )


def downgrade() -> None:
    # Nothing to undo: a sequence position is not schema.
    pass
