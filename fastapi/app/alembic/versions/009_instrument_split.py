"""Split the market instrument out of the holding

Revision ID: 009
Revises: 008
Create Date: 2026-10-04

`asset` mixed two things: a holding (this position, on this exchange, with this
label) and a market instrument (what it is and where its price comes from). Prices
were cached per holding, so BTC held on two exchanges was fetched and stored twice,
and in a shared deployment every portfolio would fetch BTC for itself, a load on
CoinGecko and Yahoo that grows with every user.

After this migration:

- `instrument` is global market identity: type, the feed ids (`coingecko_id`,
  `yahoo_ticker`), and a canonical symbol and name. It has no owner.
- `asset` is the holding: label (`symbol`, `name`, kept as the user wrote them),
  `exchange_id` and `instrument_id`.
- `price_cache` is keyed by `(instrument_id, date)`.

What happens to existing rows:

- Holdings that name the same feed (same type, same `coingecko_id`, same
  case-insensitive `yahoo_ticker`) share one instrument, which takes its canonical
  symbol and name from the oldest such asset. Each asset keeps its own label.
- Holdings with no feed id (cash, manual entries) each get an instrument of their
  own: two manual "ABC" rows are not assumed to be the same thing.
- Cached prices move to the instrument. Where two holdings cached the same
  instrument on the same day, the row from the oldest asset is kept; both came from
  the same feed.

Downgrade copies the identity columns back onto every asset and every cached price
back to every holding of its instrument.
"""

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None

# The identity an instrument is shared by. Holdings with no feed id get a key of
# their own, so they are never merged. An empty string counts as no feed id: the
# SQLite-era forms stored '' as readily as NULL.
_KEY = """
    CASE WHEN NULLIF(a.coingecko_id, '') IS NULL AND NULLIF(a.yahoo_ticker, '') IS NULL
         THEN 'asset:' || a.id
         ELSE a.type || '|' || COALESCE(NULLIF(a.coingecko_id, ''), '')
                     || '|' || COALESCE(lower(NULLIF(a.yahoo_ticker, '')), '')
    END
"""


def upgrade() -> None:
    op.create_table(
        "instrument",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("yahoo_ticker", sa.String(length=50), nullable=True),
        sa.Column("coingecko_id", sa.String(length=100), nullable=True),
        sa.Column("migration_key", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    # One instrument per feed identity. Feedless instruments are exempt: they are
    # one per holding by design.
    op.execute(
        """
        CREATE UNIQUE INDEX instrument_feed_identity ON instrument
          (type, COALESCE(coingecko_id, ''), COALESCE(lower(yahoo_ticker), ''))
          WHERE coingecko_id IS NOT NULL OR yahoo_ticker IS NOT NULL
        """
    )

    op.execute(
        f"""
        INSERT INTO instrument (type, symbol, name, yahoo_ticker, coingecko_id, migration_key)
        SELECT DISTINCT ON (key)
               type, symbol, name, NULLIF(yahoo_ticker, ''), NULLIF(coingecko_id, ''), key
        FROM (SELECT a.*, {_KEY} AS key FROM asset a) a
        ORDER BY key, id
        """
    )

    op.add_column("asset", sa.Column("instrument_id", sa.Integer(), nullable=True))
    op.execute(
        f"""
        UPDATE asset a SET instrument_id = i.id
        FROM instrument i WHERE i.migration_key = {_KEY}
        """
    )
    op.alter_column("asset", "instrument_id", nullable=False)
    op.create_foreign_key("asset_instrument_id_fkey", "asset", "instrument", ["instrument_id"], ["id"])
    op.create_index("asset_instrument_id_idx", "asset", ["instrument_id"])

    # Prices follow the holding to its instrument; duplicates collapse to the
    # oldest asset's row.
    op.add_column("price_cache", sa.Column("instrument_id", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE price_cache p SET instrument_id = a.instrument_id FROM asset a WHERE a.id = p.asset_id"
    )
    op.execute(
        """
        DELETE FROM price_cache p USING price_cache q
        WHERE p.instrument_id = q.instrument_id AND p.date = q.date AND p.asset_id > q.asset_id
        """
    )
    op.drop_constraint("price_cache_pkey", "price_cache", type_="primary")
    op.drop_constraint("price_cache_asset_id_fkey", "price_cache", type_="foreignkey")
    op.drop_column("price_cache", "asset_id")
    op.alter_column("price_cache", "instrument_id", nullable=False)
    op.create_primary_key("price_cache_pkey", "price_cache", ["instrument_id", "date"])
    op.create_foreign_key(
        "price_cache_instrument_id_fkey", "price_cache", "instrument", ["instrument_id"], ["id"]
    )

    for column in ("type", "yahoo_ticker", "coingecko_id"):
        op.drop_column("asset", column)
    op.drop_column("instrument", "migration_key")


def downgrade() -> None:
    op.add_column("asset", sa.Column("type", sa.String(length=20), nullable=True))
    op.add_column("asset", sa.Column("yahoo_ticker", sa.String(length=50), nullable=True))
    op.add_column("asset", sa.Column("coingecko_id", sa.String(length=100), nullable=True))
    op.execute(
        """
        UPDATE asset a SET type = i.type, yahoo_ticker = i.yahoo_ticker, coingecko_id = i.coingecko_id
        FROM instrument i WHERE i.id = a.instrument_id
        """
    )
    op.alter_column("asset", "type", nullable=False)

    # Every holding of an instrument gets its own copy of the instrument's prices.
    op.add_column("price_cache", sa.Column("asset_id", sa.Integer(), nullable=True))
    op.drop_constraint("price_cache_pkey", "price_cache", type_="primary")
    op.drop_constraint("price_cache_instrument_id_fkey", "price_cache", type_="foreignkey")
    op.execute(
        """
        INSERT INTO price_cache (asset_id, instrument_id, date, price_eur, exchange_rate)
        SELECT a.id, p.instrument_id, p.date, p.price_eur, p.exchange_rate
        FROM price_cache p JOIN asset a ON a.instrument_id = p.instrument_id
        WHERE p.asset_id IS NULL
        """
    )
    op.execute("DELETE FROM price_cache WHERE asset_id IS NULL")
    op.drop_column("price_cache", "instrument_id")
    op.alter_column("price_cache", "asset_id", nullable=False)
    op.create_primary_key("price_cache_pkey", "price_cache", ["asset_id", "date"])
    op.create_foreign_key("price_cache_asset_id_fkey", "price_cache", "asset", ["asset_id"], ["id"])

    op.drop_index("asset_instrument_id_idx", table_name="asset")
    op.drop_constraint("asset_instrument_id_fkey", "asset", type_="foreignkey")
    op.drop_column("asset", "instrument_id")
    op.drop_table("instrument")
