"""The groundwork migrations (006 onwards) can be undone and redone, with data.

The ledger is live financial data, so a round trip has to bring the rows back, not
merely the tables.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

import app
from app.core.db import engine


def _config() -> Config:
    app_dir = Path(app.__file__).parent
    cfg = Config(str(app_dir.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(app_dir / "alembic"))
    return cfg


def test_downgrade_to_005_and_back_keeps_the_ledger(client: TestClient) -> None:
    asset = client.post(
        "/api/v1/assets/",
        json={"symbol": "BTC", "name": "Bitcoin", "type": "crypto", "exchange_id": 1,
              "coingecko_id": "bitcoin"},
    ).json()["asset"]
    client.post(
        "/api/v1/transactions/",
        json={"asset_id": asset["id"], "date": "2026-01-05", "type": "buy",
              "units": 0.12345678, "eur_amount": 5000.1},
    )
    before_assets = client.get("/api/v1/assets/").json()
    before_txs = client.get(f"/api/v1/transactions/{asset['id']}").json()

    cfg = _config()
    # 005, not further: 004 backfills `venue` from the exchange on the way up, which is
    # its job, so a round trip through it is not expected to be an identity.
    command.downgrade(cfg, "005")
    command.upgrade(cfg, "head")

    assert client.get("/api/v1/assets/").json() == before_assets
    assert client.get(f"/api/v1/transactions/{asset['id']}").json() == before_txs


def test_009_groups_existing_holdings_by_feed() -> None:
    """Legacy rows as they stood at 008: identity on the asset, prices per asset."""
    cfg = _config()
    command.downgrade(cfg, "008")
    try:
        with engine.begin() as conn:
            conn.execute(text(
                """
                INSERT INTO asset (id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id) VALUES
                  (1, 'BTC', 'Bitcoin', 'crypto', 1, NULL, 'bitcoin'),
                  (2, 'XBT', 'Cold', 'crypto', 2, '', 'bitcoin'),
                  (3, 'EUR', 'Euro', 'cash', 2, '', ''),
                  (4, 'EUR', 'Euro', 'cash', 1, NULL, NULL)
                """
            ))
            conn.execute(text(
                """
                INSERT INTO price_cache (asset_id, date, price_eur, exchange_rate) VALUES
                  (1, '2026-01-10', 40000, 1.1),
                  (2, '2026-01-10', 40001, 1.1),
                  (2, '2026-01-11', 41000, 1.1)
                """
            ))
    finally:
        command.upgrade(cfg, "head")

    with engine.connect() as conn:
        instrument_of = dict(conn.execute(text("SELECT id, instrument_id FROM asset")).all())
        prices = conn.execute(
            text("SELECT instrument_id, to_char(date, 'YYYY-MM-DD'), price_eur FROM price_cache ORDER BY date")
        ).all()
        labels = conn.execute(text("SELECT symbol, name FROM asset WHERE id = 2")).one()

    # '' and NULL both mean "no feed id": the two bitcoins share, the two cash rows don't.
    assert instrument_of[1] == instrument_of[2]
    assert len({instrument_of[1], instrument_of[3], instrument_of[4]}) == 3
    assert tuple(labels) == ("XBT", "Cold")
    # The duplicate day collapses to the oldest asset's row; the other day survives.
    assert [(p[1], p[2]) for p in prices] == [("2026-01-10", 40000.0), ("2026-01-11", 41000.0)]
