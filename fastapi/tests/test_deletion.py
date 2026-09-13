"""Deleting rows: transactions, exchanges and whole positions.

These are the paths that were broken. The transaction endpoint always worked
server-side (the bug was `window.confirm()` in the webview never resolving true), but
exchange deletion answered an opaque 500 whenever anything still referenced the row,
and deleting a position was not implemented at all.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Asset, PositionSnapshot, PriceCache, Transaction


def _make_asset(client: TestClient, symbol: str = "BTC", exchange_id: int = 1) -> int:
    response = client.post(
        "/api/assets/",
        json={
            "symbol": symbol,
            "name": symbol,
            "type": "crypto",
            "exchange_id": exchange_id,
            "coingecko_id": symbol.lower(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["asset"]["id"]


def _make_tx(client: TestClient, asset_id: int, **kwargs: object) -> int:
    body = {
        "asset_id": asset_id,
        "date": "2026-01-10",
        "type": "buy",
        "units": 0.5,
        "eur_amount": 20000,
    }
    body.update(kwargs)  # type: ignore[arg-type]
    response = client.post("/api/transactions/", json=body)
    assert response.status_code == 201, response.text
    return response.json()["transaction"]["id"]


# --- transactions -----------------------------------------------------------------


def test_deleting_a_transaction_hides_it_from_the_list(client: TestClient) -> None:
    asset_id = _make_asset(client)
    tx_id = _make_tx(client, asset_id)

    assert len(client.get(f"/api/transactions/{asset_id}").json()["transactions"]) == 1
    assert client.delete(f"/api/transactions/{tx_id}/delete").status_code == 200
    assert client.get(f"/api/transactions/{asset_id}").json()["transactions"] == []


def test_deleting_a_transaction_is_a_soft_delete(
    client: TestClient, session: Session
) -> None:
    """The row stays so a mistaken delete is recoverable; only deleted_at is set."""
    asset_id = _make_asset(client)
    tx_id = _make_tx(client, asset_id)
    client.delete(f"/api/transactions/{tx_id}/delete")

    row = session.get(Transaction, tx_id)
    assert row is not None
    assert row.deleted_at is not None


def test_deleting_a_transaction_removes_it_from_the_position(client: TestClient) -> None:
    """A soft-deleted buy must stop counting towards units held and invested."""
    asset_id = _make_asset(client)
    tx_id = _make_tx(client, asset_id)

    position = client.get("/api/positions/").json()["positions"][0]
    assert position["units_held"] == 0.5
    assert position["total_invested_eur"] == 20000

    client.delete(f"/api/transactions/{tx_id}/delete")

    positions = client.get("/api/positions/").json()["positions"]
    assert [p for p in positions if p["asset"]["id"] == asset_id][0]["units_held"] == 0


def test_deleting_a_missing_transaction_is_404(client: TestClient) -> None:
    assert client.delete("/api/transactions/9999/delete").status_code == 404


# --- exchanges --------------------------------------------------------------------


def test_deleting_an_empty_exchange_works(client: TestClient) -> None:
    created = client.post("/api/exchanges/", json={"name": "Kraken", "type": "crypto"})
    exchange_id = created.json()["exchange"]["id"]

    assert client.delete(f"/api/exchanges/{exchange_id}").status_code == 200
    names = [e["name"] for e in client.get("/api/exchanges/").json()["exchanges"]]
    assert "Kraken" not in names


def test_deleting_an_exchange_that_still_holds_assets_is_409(client: TestClient) -> None:
    """This was the 500: the foreign key failed and the error reached the user raw."""
    _make_asset(client, "BTC", exchange_id=1)

    response = client.delete("/api/exchanges/1")
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "BTC" in detail
    assert "Crypto" in detail


def test_a_blocked_exchange_delete_changes_nothing(client: TestClient) -> None:
    _make_asset(client, "BTC", exchange_id=1)
    client.delete("/api/exchanges/1")

    ids = [e["id"] for e in client.get("/api/exchanges/").json()["exchanges"]]
    assert 1 in ids


def test_deleting_a_missing_exchange_is_404(client: TestClient) -> None:
    """It used to answer ok:true for an id that was never there."""
    assert client.delete("/api/exchanges/9999").status_code == 404


def test_an_exchange_can_be_deleted_once_its_assets_are_gone(client: TestClient) -> None:
    asset_id = _make_asset(client, "BTC", exchange_id=1)
    assert client.delete("/api/exchanges/1").status_code == 409

    assert client.delete(f"/api/assets/{asset_id}").status_code == 200
    assert client.delete("/api/exchanges/1").status_code == 200


def test_creating_an_exchange_after_the_seed_does_not_collide(client: TestClient) -> None:
    """Migration 001 seeds ids 1 and 2 explicitly, which leaves a Postgres sequence
    parked at 1 unless migration 002 realigns it. Without that fix this 500s."""
    first = client.post("/api/exchanges/", json={"name": "Kraken", "type": "crypto"})
    second = client.post("/api/exchanges/", json={"name": "DeGiro", "type": "broker"})

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["exchange"]["id"] == 3
    assert second.json()["exchange"]["id"] == 4


# --- positions --------------------------------------------------------------------


def test_deleting_a_position_removes_it(client: TestClient) -> None:
    asset_id = _make_asset(client)
    _make_tx(client, asset_id)

    assert client.delete(f"/api/assets/{asset_id}").status_code == 200
    assert client.get("/api/positions/").json()["positions"] == []
    assert client.get(f"/api/assets/{asset_id}").status_code == 404


def test_deleting_a_position_takes_its_history_with_it(
    client: TestClient, session: Session
) -> None:
    """Orphaned transactions and cached prices would keep skewing the snapshots."""
    asset_id = _make_asset(client)
    _make_tx(client, asset_id)
    session.add(PriceCache(asset_id=asset_id, date="2026-01-10", price_eur=40000, exchange_rate=1.1))
    session.add(
        PositionSnapshot(
            date="2026-01-10", asset_id=asset_id, units_held=0.5,
            price_eur=40000, value_eur=20000, invested_eur=20000,
        )
    )
    session.commit()

    assert client.delete(f"/api/assets/{asset_id}").status_code == 200

    session.expire_all()
    assert session.exec(select(Transaction).where(Transaction.asset_id == asset_id)).all() == []
    assert session.exec(select(PriceCache).where(PriceCache.asset_id == asset_id)).all() == []
    assert session.exec(select(PositionSnapshot).where(PositionSnapshot.asset_id == asset_id)).all() == []
    assert session.get(Asset, asset_id) is None


def test_deleting_one_position_leaves_the_others_alone(client: TestClient) -> None:
    btc = _make_asset(client, "BTC")
    eth = _make_asset(client, "ETH")
    _make_tx(client, btc)
    _make_tx(client, eth)

    client.delete(f"/api/assets/{btc}")

    symbols = [p["asset"]["symbol"] for p in client.get("/api/positions/").json()["positions"]]
    assert symbols == ["ETH"]


def test_deleting_a_missing_position_is_404(client: TestClient) -> None:
    assert client.delete("/api/assets/9999").status_code == 404
