"""Price-refresh lease in Postgres

Revision ID: 006
Revises: 005
Create Date: 2026-10-04

The refresh cooldown used to be two module globals in `api/routes/prices.py`: the time
of the last successful refresh and the asyncio task of the one in flight. Per process
state, so a second uvicorn worker or replica kept its own clock and the throttle on
CoinGecko and Yahoo multiplied with the instance count. That pinned the api to one
process.

One row now holds both facts for every process:

- `last_success_at`: when a refresh last got at least one quote. The cooldown runs
  from here.
- `running_until`: a lease. A refresh claims it with a single conditional UPDATE and
  clears it when done; if the process dies mid-refresh the lease simply expires,
  where an advisory lock would need the connection to stay up across every `await`.

No existing data is touched. The row starts empty, so the first refresh after this
deploys is never throttled, which matches a fresh process under the old code.
"""

import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_state",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("running_until", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        # A singleton: the claim below updates row 1 and nothing else.
        sa.CheckConstraint("id = 1", name="refresh_state_singleton"),
    )
    op.execute("INSERT INTO refresh_state (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("refresh_state")
