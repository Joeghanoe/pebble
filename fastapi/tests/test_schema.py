"""What the column types guarantee, pinned against the real schema."""

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine
from app.models import Asset, Transaction


def _column_type(table: str, column: str) -> str:
    with engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).scalar_one()


def test_amounts_are_numeric() -> None:
    assert _column_type("transaction", "eur_amount") == "numeric"
    assert _column_type("price_cache", "price_eur") == "numeric"
    assert _column_type("position_snapshot", "value_eur") == "numeric"


def test_sums_are_exact(session: Session) -> None:
    """The point of migration 005: 0.1 + 0.2 is 0.3 in a ledger, not 0.30000000000000004."""
    asset = Asset(symbol="EUR", name="Euro", type="cash", exchange_id=2)
    session.add(asset)
    session.commit()
    for amount in (0.1, 0.2):
        session.add(
            Transaction(asset_id=asset.id, date="2026-01-05", type="buy", units=amount, eur_amount=amount)
        )
    session.commit()

    total = session.exec(text('SELECT SUM(eur_amount) FROM "transaction"')).one()[0]

    assert total == 0.3
    assert isinstance(total, float), "raw SQL must hand back floats, not Decimal"


def test_dates_are_dates_but_read_as_iso_strings(session: Session) -> None:
    """Postgres validates and orders them; Python and the API still see 'YYYY-MM-DD'."""
    assert _column_type("transaction", "date") == "date"
    assert _column_type("net_worth_snapshot", "date") == "date"
    assert _column_type("transaction", "deleted_at") == "timestamp with time zone"

    asset = Asset(symbol="EUR", name="Euro", type="cash", exchange_id=2)
    session.add(asset)
    session.commit()
    tx = Transaction(asset_id=asset.id, date="2026-01-05", type="buy", units=1, eur_amount=1)
    session.add(tx)
    session.commit()
    session.refresh(tx)

    assert tx.date == "2026-01-05"
