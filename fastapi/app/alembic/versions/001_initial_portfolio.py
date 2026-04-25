"""Initial portfolio schema

Revision ID: 001
Revises:
Create Date: 2026-04-25
"""

import sqlalchemy as sa
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exchange",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "asset",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("exchange_id", sa.Integer(), nullable=False),
        sa.Column("yahoo_ticker", sa.String(length=50), nullable=True),
        sa.Column("coingecko_id", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["exchange_id"], ["exchange.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "transaction",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("units", sa.Float(), nullable=False),
        sa.Column("eur_amount", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("external_id", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(["asset_id"], ["asset.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "price_cache",
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("price_eur", sa.Float(), nullable=False),
        sa.Column("exchange_rate", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["asset.id"]),
        sa.PrimaryKeyConstraint("asset_id", "date"),
    )
    op.create_table(
        "net_worth_snapshot",
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("total_eur", sa.Float(), nullable=False),
        sa.Column("invested_eur", sa.Float(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("date"),
    )
    op.create_table(
        "position_snapshot",
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("units_held", sa.Float(), nullable=False),
        sa.Column("price_eur", sa.Float(), nullable=False),
        sa.Column("value_eur", sa.Float(), nullable=False),
        sa.Column("invested_eur", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["asset.id"]),
        sa.PrimaryKeyConstraint("date", "asset_id"),
    )

    # Seed default exchanges
    op.execute("INSERT INTO exchange (id, name, type) VALUES (1, 'Crypto', 'crypto')")
    op.execute("INSERT INTO exchange (id, name, type) VALUES (2, 'Manual', 'manual')")


def downgrade() -> None:
    op.drop_table("position_snapshot")
    op.drop_table("net_worth_snapshot")
    op.drop_table("price_cache")
    op.drop_table("transaction")
    op.drop_table("asset")
    op.drop_table("exchange")
