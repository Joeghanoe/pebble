"""Every migration since the single-tenant baseline can be undone and redone, with data.

The ledger is live financial data, so a round trip has to bring the rows back, not
merely the tables.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

import app


def _config() -> Config:
    app_dir = Path(app.__file__).parent
    cfg = Config(str(app_dir.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(app_dir / "alembic"))
    return cfg


def test_downgrade_to_003_and_back_keeps_the_ledger(client: TestClient) -> None:
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
    command.downgrade(cfg, "003")
    command.upgrade(cfg, "head")

    assert client.get("/api/v1/assets/").json() == before_assets
    assert client.get(f"/api/v1/transactions/{asset['id']}").json() == before_txs
