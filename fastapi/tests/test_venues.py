"""Venues: where each transaction happened, and what that says about holdings.

What needs pinning: a move relocates units between venues without touching the
units held, the money invested or the P&L; holdings per venue add up to the
position; venues are validated at the edge; renaming onto an existing venue
merges them; and migration 004 backfills existing rows from their exchange.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

from app import crud
from app.core.db import engine


def _asset(client: TestClient, symbol: str = "BTC", type_: str = "crypto") -> int:
    # No exchange: new positions no longer need one.
    response = client.post(
        "/api/assets/", json={"symbol": symbol, "name": symbol, "type": type_}
    )
    assert response.status_code == 201, response.text
    return response.json()["asset"]["id"]


def _tx(client: TestClient, asset_id: int, **fields) -> dict:  # noqa: ANN003
    body = {"asset_id": asset_id, "date": "2026-09-01", "units": 1, "eur_amount": 100}
    body.update(fields)
    return client.post("/api/transactions/", json=body)


def _position(client: TestClient, asset_id: int) -> dict:
    return next(
        p for p in client.get("/api/positions/").json()["positions"]
        if p["asset"]["id"] == asset_id
    )


def test_holdings_follow_buys_sells_and_moves(client: TestClient) -> None:
    btc = _asset(client)
    _tx(client, btc, type="buy", units=1.0, eur_amount=50_000, venue="Bitvavo")
    _tx(client, btc, type="buy", units=0.5, eur_amount=30_000, venue="Revolut")
    _tx(client, btc, type="move", units=0.4, eur_amount=0, venue="Bitvavo", to_venue="MetaMask")
    _tx(client, btc, type="sell", units=0.1, eur_amount=7_000, venue="Revolut")

    position = _position(client, btc)

    assert position["venues"] == [
        {"venue": "Bitvavo", "units": 0.6},
        {"venue": "MetaMask", "units": 0.4},
        {"venue": "Revolut", "units": 0.4},
    ]
    assert sum(v["units"] for v in position["venues"]) == position["units_held"]


def test_a_move_changes_nothing_but_the_venue(client: TestClient, session: Session) -> None:
    btc = _asset(client)
    _tx(client, btc, type="buy", units=1.0, eur_amount=50_000, venue="Bitvavo")
    before = _position(client, btc)

    response = _tx(
        client, btc, type="move", units=0.25, eur_amount=999, venue="Bitvavo", to_venue="MetaMask"
    )
    assert response.status_code == 201, response.text
    after = _position(client, btc)

    for key in ("units_held", "total_invested_eur", "realized_pnl"):
        assert after[key] == before[key], key
    assert crud.get_units_held_on_date(session, btc, "2026-09-30") == 1.0
    assert crud.get_invested_eur_on_date(session, "2026-09-30", asset_id=btc) == 50_000
    # A move carries no money, whatever was sent.
    assert response.json()["transaction"]["eur_amount"] == 0


def test_cash_balances_per_venue(client: TestClient) -> None:
    eur = _asset(client, "EUR", "cash")
    _tx(client, eur, type="buy", units=3_000, eur_amount=3_000, venue="Revolut")
    _tx(client, eur, type="buy", units=2_000, eur_amount=2_000, venue="Bitvavo")
    _tx(client, eur, type="move", units=500, eur_amount=0, venue="Revolut", to_venue="Bitvavo")

    position = _position(client, eur)

    assert position["venues"] == [
        {"venue": "Revolut", "units": 2_500},
        {"venue": "Bitvavo", "units": 2_500},
    ] or position["venues"] == [
        {"venue": "Bitvavo", "units": 2_500},
        {"venue": "Revolut", "units": 2_500},
    ]
    assert position["units_held"] == 5_000


def test_a_move_needs_two_different_venues(client: TestClient) -> None:
    btc = _asset(client)
    assert _tx(client, btc, type="move", venue="Bitvavo").status_code == 422
    assert _tx(client, btc, type="move", to_venue="MetaMask").status_code == 422
    assert _tx(client, btc, type="move", venue="Bitvavo", to_venue="Bitvavo").status_code == 422


def test_only_a_move_has_a_destination(client: TestClient) -> None:
    btc = _asset(client)
    assert _tx(client, btc, type="buy", venue="Bitvavo", to_venue="MetaMask").status_code == 422


def test_venue_names_are_trimmed(client: TestClient) -> None:
    btc = _asset(client)
    _tx(client, btc, type="buy", venue="  Revolut ")
    assert client.get("/api/venues/").json()["venues"] == [
        {"name": "Revolut", "transactions": 1}
    ]


def test_venues_list_counts_both_ends_of_a_move(client: TestClient) -> None:
    btc = _asset(client)
    _tx(client, btc, type="buy", venue="Bitvavo")
    _tx(client, btc, type="move", venue="Bitvavo", to_venue="MetaMask")

    assert client.get("/api/venues/").json()["venues"] == [
        {"name": "Bitvavo", "transactions": 2},
        {"name": "MetaMask", "transactions": 1},
    ]


def test_renaming_onto_an_existing_venue_merges_them(client: TestClient) -> None:
    btc = _asset(client)
    _tx(client, btc, type="buy", units=1, venue="Bitvavo")
    _tx(client, btc, type="buy", units=2, venue="bitvavo")
    _tx(client, btc, type="move", units=1, venue="bitvavo", to_venue="MetaMask")

    response = client.post(
        "/api/venues/rename", json={"from_name": "bitvavo", "to_name": "Bitvavo"}
    )

    assert response.json() == {"changed": 2}
    assert _position(client, btc)["venues"] == [
        {"venue": "Bitvavo", "units": 2.0},
        {"venue": "MetaMask", "units": 1.0},
    ]


def test_renaming_an_unknown_venue_is_a_404(client: TestClient) -> None:
    response = client.post("/api/venues/rename", json={"from_name": "Nowhere", "to_name": "X"})
    assert response.status_code == 404


def test_migration_004_backfills_venues_from_the_exchange() -> None:
    app_dir = Path(__file__).parent.parent / "app"
    cfg = Config(str(app_dir.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(app_dir / "alembic"))

    command.downgrade(cfg, "003")
    try:
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO exchange (id, name, type) VALUES (3, 'Revolut', 'broker')"))
            conn.execute(
                text(
                    "INSERT INTO asset (id, symbol, name, type, exchange_id) "
                    "VALUES (1, 'VUAA', 'S&P 500', 'etf', 3)"
                )
            )
            conn.execute(
                text(
                    'INSERT INTO "transaction" (asset_id, date, type, units, eur_amount, source) '
                    "VALUES (1, '2026-01-02', 'buy', 2, 200, 'manual')"
                )
            )
    finally:
        command.upgrade(cfg, "head")

    with engine.begin() as conn:
        venue = conn.execute(text('SELECT venue, to_venue FROM "transaction"')).one()
        nullable = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name = 'asset' AND column_name = 'exchange_id'"
            )
        ).scalar_one()

    assert tuple(venue) == ("Revolut", None)
    assert nullable == "YES"
