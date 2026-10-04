"""Holdings that name the same feed share one instrument, and so one price history."""

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.db import engine
from app.models import Asset, Instrument, PriceCache
from tests.factories import cache_price, make_asset


def _asset(client: TestClient, **body: object) -> dict:
    payload = {"symbol": "BTC", "name": "Bitcoin", "type": "crypto", "exchange_id": 1}
    payload.update(body)
    response = client.post("/api/v1/assets/", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["asset"]


def test_the_same_coin_on_two_exchanges_shares_an_instrument(
    client: TestClient, session: Session
) -> None:
    kraken = _asset(client, exchange_id=1, coingecko_id="bitcoin")
    ledger = _asset(client, exchange_id=2, symbol="XBT", name="Cold storage", coingecko_id="bitcoin")

    assert kraken["instrument_id"] == ledger["instrument_id"]
    # Each holding keeps the label its owner gave it.
    assert (ledger["symbol"], ledger["name"]) == ("XBT", "Cold storage")

    cache_price(session, kraken["id"], "2026-01-10", 40_000)
    session.commit()
    rows = session.exec(select(PriceCache)).all()
    assert len(rows) == 1, "one fetch, one cached row, whoever holds it"


def test_tickers_match_case_insensitively(client: TestClient) -> None:
    a = _asset(client, symbol="VWCE", type="etf", yahoo_ticker="VWCE.DE")
    b = _asset(client, symbol="VWCE", type="etf", yahoo_ticker="vwce.de", exchange_id=2)

    assert a["instrument_id"] == b["instrument_id"]


def test_feedless_holdings_are_never_merged(client: TestClient) -> None:
    """Two manual entries with the same symbol are not known to be the same thing."""
    a = _asset(client, symbol="ABC", type="stock")
    b = _asset(client, symbol="ABC", type="stock", exchange_id=2)

    assert a["instrument_id"] != b["instrument_id"]


def test_correcting_a_feed_id_repoints_the_holding_only(client: TestClient, session: Session) -> None:
    """The shared instrument is never edited in place; the other holder is unaffected."""
    a = _asset(client, coingecko_id="bitcoin")
    b = _asset(client, coingecko_id="bitcoin", exchange_id=2)

    response = client.put(f"/api/v1/assets/{b['id']}", json={"coingecko_id": "bitcoin-cash"})
    assert response.status_code == 200, response.text
    moved = response.json()["asset"]

    assert moved["coingecko_id"] == "bitcoin-cash"
    assert moved["instrument_id"] != a["instrument_id"]
    assert client.get(f"/api/v1/assets/{a['id']}").json()["asset"]["coingecko_id"] == "bitcoin"
    assert len(session.exec(select(Instrument)).all()) == 2


def test_relabelling_keeps_the_instrument(client: TestClient) -> None:
    a = _asset(client, coingecko_id="bitcoin")

    renamed = client.put(f"/api/v1/assets/{a['id']}", json={"name": "Long-term stack"}).json()["asset"]

    assert renamed["name"] == "Long-term stack"
    assert renamed["instrument_id"] == a["instrument_id"]


def test_positions_price_every_holding_of_an_instrument(client: TestClient, session: Session) -> None:
    from datetime import date

    first = make_asset(session, "BTC", coingecko_id="bitcoin", exchange_id=1)
    second = make_asset(session, "BTC", coingecko_id="bitcoin", exchange_id=2)
    for asset_id in (first, second):
        client.post(
            "/api/v1/transactions/",
            json={"asset_id": asset_id, "date": "2026-01-05", "type": "buy",
                  "units": 1, "eur_amount": 30_000},
        )
    cache_price(session, first, date.today().isoformat(), 50_000)
    session.commit()

    values = [p["current_value_eur"] for p in client.get("/api/v1/positions/").json()["positions"]]

    assert values == [50_000, 50_000]


def test_racing_creates_settle_on_one_instrument(session: Session) -> None:
    """Two requests adding the same coin at once: the loser reuses the winner's row."""
    def add(exchange_id: int) -> int:
        with Session(engine) as s:
            asset_id = make_asset(s, "BTC", coingecko_id="bitcoin", exchange_id=exchange_id)
            return s.get(Asset, asset_id).instrument_id  # type: ignore[union-attr]

    with ThreadPoolExecutor(max_workers=6) as pool:
        instrument_ids = set(pool.map(add, [1, 2] * 3))

    assert len(instrument_ids) == 1
    assert len(session.exec(select(Instrument)).all()) == 1
