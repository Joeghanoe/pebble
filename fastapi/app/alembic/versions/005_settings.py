"""Settings documents

Revision ID: 005
Revises: 004
Create Date: 2026-09-29

The settings screen kept its state in localStorage, so every device started from the
defaults and a phone never matched the laptop. One row per document (`preferences`,
`strategy`) moves them into the ledger's database. JSONB because the API treats the
value as opaque: the SPA owns its shape and merges it over its own defaults.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "setting",
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("name"),
    )


def downgrade() -> None:
    op.drop_table("setting")
