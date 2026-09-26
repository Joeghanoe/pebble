"""The year of daily BTC closes behind the strategy view's 200-day average.

What needs pinning: the backfill asks upstream only when a day is missing, asks
once for the whole hole rather than per day, and the endpoint hands back the
year as cached — oldest first, nothing older, nothing for a portfolio with no BTC.
"""

import asyncio
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Asset, Exchange, PriceCache
from app.services import btc_history


class _FakePriceService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def backfill_price_range(self, session, asset, start, end) -> int:  # noqa: ANN001
        self.calls.append((start, end))
        return 0


def _btc(session: Session, coingecko_id: str | None = "bitcoin") -> int:
    exchange = Exchange(name="Venue", type="crypto")
    session.add(exchange)
    session.commit()
    asset = Asset(
        symbol="BTC", name="Bitcoin", type="crypto", exchange_id=exchange.id,
        coingecko_id=coingecko_id,
    )
    session.add(asset)
    session.commit()
    return asset.id  # type: ignore[return-value]


def _price(session: Session, asset_id: int, day: date, price: float = 50_000.0) -> None:
    session.add(
        PriceCache(asset_id=asset_id, date=day.isoformat(), price_eur=price, exchange_rate=1.1)
    )


def _fake(monkeypatch) -> _FakePriceService:  # noqa: ANN001
    fake = _FakePriceService()
    monkeypatch.setattr(btc_history, "get_price_service", lambda: fake)
    return fake


def test_a_full_year_makes_no_request(session: Session, monkeypatch) -> None:  # noqa: ANN001
    fake = _fake(monkeypatch)
    asset_id = _btc(session)
    today = date.today()
    for offset in range(1, btc_history.BTC_HISTORY_DAYS):
        _price(session, asset_id, today - timedelta(days=offset))
    session.commit()

    asyncio.run(btc_history.ensure_btc_daily_history(session))

    assert fake.calls == []


def test_a_hole_is_filled_in_one_request_spanning_it(
    session: Session, monkeypatch  # noqa: ANN001
) -> None:
    fake = _fake(monkeypatch)
    asset_id = _btc(session)
    today = date.today()
    # The last ninety days are there, as the daily gap fill leaves them.
    for offset in range(1, 91):
        _price(session, asset_id, today - timedelta(days=offset))
    session.commit()

    asyncio.run(btc_history.ensure_btc_daily_history(session))

    assert fake.calls == [
        (
            (today - timedelta(days=btc_history.BTC_HISTORY_DAYS - 1)).isoformat(),
            (today - timedelta(days=91)).isoformat(),
        )
    ]


def test_no_btc_means_nothing_to_fill(session: Session, monkeypatch) -> None:  # noqa: ANN001
    fake = _fake(monkeypatch)
    _btc(session, coingecko_id=None)

    asyncio.run(btc_history.ensure_btc_daily_history(session))

    assert fake.calls == []


def test_endpoint_returns_the_year_oldest_first(client: TestClient, session: Session) -> None:
    asset_id = _btc(session)
    today = date.today()
    _price(session, asset_id, today - timedelta(days=400), 1.0)  # outside the year
    _price(session, asset_id, today, 3.0)
    _price(session, asset_id, today - timedelta(days=10), 2.0)
    session.commit()

    closes = client.get("/api/prices/btc/daily").json()["closes"]

    assert closes == [
        {"date": (today - timedelta(days=10)).isoformat(), "price_eur": 2.0},
        {"date": today.isoformat(), "price_eur": 3.0},
    ]


def test_endpoint_is_empty_without_btc(client: TestClient) -> None:
    assert client.get("/api/prices/btc/daily").json() == {"closes": []}
