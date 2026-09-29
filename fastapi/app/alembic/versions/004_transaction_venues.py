"""Record where each transaction happened

Revision ID: 004
Revises: 003
Create Date: 2026-09-29

Where money sits was an attribute of the position: an asset belonged to one
exchange. That cannot describe BTC split between Bitvavo and a MetaMask wallet,
or a single euro balance spread over Revolut and Bitvavo. The venue moves to the
transaction:

- `transaction.venue` — where a buy, sell, deposit or withdrawal happened, and
  for a move, where the units left from.
- `transaction.to_venue` — for a move only, where they arrived.

Existing rows are backfilled with the name of their asset's exchange, which is
the best record there is of where they happened. `asset.exchange_id` becomes
optional: new positions no longer need one, and the column is left in place
rather than dropped so this migration loses nothing.
"""

import sqlalchemy as sa
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transaction", sa.Column("venue", sa.String(length=100), nullable=True))
    op.add_column("transaction", sa.Column("to_venue", sa.String(length=100), nullable=True))

    op.execute(
        """
        UPDATE "transaction" t
        SET venue = e.name
        FROM asset a JOIN exchange e ON e.id = a.exchange_id
        WHERE a.id = t.asset_id AND t.venue IS NULL
        """
    )

    with op.batch_alter_table("asset") as batch:
        batch.alter_column("exchange_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # A move has no meaning without its destination, and the old model cannot
    # hold one; they are removed rather than left to read as sells.
    op.execute("""DELETE FROM "transaction" WHERE type = 'move'""")
    # Assets created without an exchange get the seeded manual one back, since
    # the old schema requires it.
    op.execute(
        "UPDATE asset SET exchange_id = (SELECT MIN(id) FROM exchange) WHERE exchange_id IS NULL"
    )
    with op.batch_alter_table("asset") as batch:
        batch.alter_column("exchange_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("transaction", "to_venue")
    op.drop_column("transaction", "venue")
