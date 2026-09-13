"""Widen transaction.deleted_at

Revision ID: 003
Revises: 002
Create Date: 2026-09-12

`deleted_at` holds an ISO 8601 timestamp written by `soft_delete_transaction`. With
microseconds and a UTC offset that is 32 characters:

    2026-09-12T10:31:54.884807+00:00

The column was declared VARCHAR(30). SQLite does not enforce declared string lengths,
so the desktop build never noticed; Postgres does, and the write failed with
StringDataRightTruncation -- meaning deleting a transaction 500s.

The value is also normalised to whole seconds at the source now, but the column is
widened anyway: 30 was never a length this format fits, and a stricter column is not
worth a second outage if the format ever changes again.
"""

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("transaction") as batch:
        batch.alter_column(
            "deleted_at",
            existing_type=sa.String(length=30),
            type_=sa.String(length=40),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("transaction") as batch:
        batch.alter_column(
            "deleted_at",
            existing_type=sa.String(length=40),
            type_=sa.String(length=30),
            existing_nullable=True,
        )
