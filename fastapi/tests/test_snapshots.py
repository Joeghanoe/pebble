"""The net-worth aggregation SQL, which had to be rewritten for Postgres.

`list_snapshots_aggregated` used SQLite's `strftime('%Y-%W', date)` / `'%Y-%m'` to pick
the last snapshot in each week or month. Postgres has neither, so the buckets are now
`to_char(date::date, 'IYYY-IW')` and a `substr` prefix. These tests pin the behaviour
that matters: one point per bucket, the latest in each, oldest first.
"""

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

from app.models import (
    Asset,
    Exchange,
    NetWorthSnapshot,
    PositionSnapshot,
    PriceCache,
    Transaction,
)


def _seed(session: Session, *dates: str) -> None:
    for i, date in enumerate(dates):
        session.add(
            NetWorthSnapshot(date=date, total_eur=1000.0 + i, invested_eur=500.0 + i)
        )
    session.commit()


def _asset(session: Session, symbol: str = "BTC") -> int:
    exchange = Exchange(name=f"Venue {symbol}", type="crypto")
    session.add(exchange)
    session.commit()
    asset = Asset(symbol=symbol, name=symbol, type="crypto", exchange_id=exchange.id)
    session.add(asset)
    session.commit()
    return asset.id


def test_daily_returns_every_snapshot_oldest_first(
    client: TestClient, session: Session
) -> None:
    _seed(session, "2026-03-01", "2026-03-02", "2026-03-03")

    dates = [s["date"] for s in client.get("/api/net-worth/?period=1d").json()["snapshots"]]
    assert dates == ["2026-03-01", "2026-03-02", "2026-03-03"]


def test_monthly_keeps_the_last_snapshot_of_each_month(
    client: TestClient, session: Session
) -> None:
    _seed(session, "2026-01-05", "2026-01-31", "2026-02-02", "2026-02-27", "2026-03-10")

    dates = [s["date"] for s in client.get("/api/net-worth/?period=1m").json()["snapshots"]]
    assert dates == ["2026-01-31", "2026-02-27", "2026-03-10"]


def test_weekly_keeps_the_last_snapshot_of_each_iso_week(
    client: TestClient, session: Session
) -> None:
    # 2026-03-02 is a Monday, so 02-08 is one ISO week and 09-15 the next.
    _seed(session, "2026-03-02", "2026-03-05", "2026-03-08", "2026-03-09", "2026-03-12")

    dates = [s["date"] for s in client.get("/api/net-worth/?period=1w").json()["snapshots"]]
    assert dates == ["2026-03-08", "2026-03-12"]


def test_weekly_spans_a_year_boundary_without_collapsing_buckets(
    client: TestClient, session: Session
) -> None:
    """A plain 'week number' bucket would merge week 1 of two different years."""
    _seed(session, "2025-01-03", "2026-01-02")

    dates = [s["date"] for s in client.get("/api/net-worth/?period=1w").json()["snapshots"]]
    assert dates == ["2025-01-03", "2026-01-02"]


def test_values_travel_with_the_selected_dates(client: TestClient, session: Session) -> None:
    _seed(session, "2026-01-05", "2026-01-31")

    snapshots = client.get("/api/net-worth/?period=1m").json()["snapshots"]
    assert len(snapshots) == 1
    assert snapshots[0] == {"date": "2026-01-31", "total_eur": 1001.0, "invested_eur": 501.0}


def test_an_unknown_period_falls_back_to_monthly(client: TestClient, session: Session) -> None:
    _seed(session, "2026-01-05", "2026-01-31")

    response = client.get("/api/net-worth/?period=nonsense")
    assert response.status_code == 200
    assert [s["date"] for s in response.json()["snapshots"]] == ["2026-01-31"]


def test_no_snapshots_is_an_empty_list(client: TestClient) -> None:
    assert client.get("/api/net-worth/?period=1m").json()["snapshots"] == []


def _seed_position(session: Session, asset_id: int, *dates: str) -> None:
    for i, date in enumerate(dates):
        session.add(
            PositionSnapshot(
                date=date,
                asset_id=asset_id,
                units_held=1.0 + i,
                price_eur=100.0 + i,
                value_eur=1000.0 + i,
                invested_eur=500.0 + i,
            )
        )
    session.commit()


def test_position_history_buckets_like_net_worth(client: TestClient, session: Session) -> None:
    asset = _asset(session)
    _seed_position(session, asset, "2026-01-05", "2026-01-31", "2026-02-02", "2026-02-27")

    dates = [
        p["date"]
        for p in client.get(f"/api/positions/{asset}/history?period=1m").json()["points"]
    ]
    assert dates == ["2026-01-31", "2026-02-27"]


def test_position_history_is_scoped_to_the_asset(client: TestClient, session: Session) -> None:
    """The bucket subquery filters by asset before MAX(date).

    Without that filter the other asset's later snapshot wins January's bucket and
    this asset's January point disappears from its own chart.
    """
    mine, theirs = _asset(session, "BTC"), _asset(session, "ETH")
    _seed_position(session, mine, "2026-01-10")
    _seed_position(session, theirs, "2026-01-20")

    points = client.get(f"/api/positions/{mine}/history?period=1m").json()["points"]
    assert [p["date"] for p in points] == ["2026-01-10"]


def test_position_history_daily_is_oldest_first(client: TestClient, session: Session) -> None:
    asset = _asset(session)
    _seed_position(session, asset, "2026-03-01", "2026-03-02", "2026-03-03")

    dates = [
        p["date"]
        for p in client.get(f"/api/positions/{asset}/history?period=1d").json()["points"]
    ]
    assert dates == ["2026-03-01", "2026-03-02", "2026-03-03"]


def test_position_history_without_snapshots_is_empty(client: TestClient, session: Session) -> None:
    assert client.get(f"/api/positions/{_asset(session)}/history").json()["points"] == []


def test_a_refresh_writes_the_position_rows_behind_the_total(
    client: TestClient, session: Session
) -> None:
    """The bug this endpoint was added for.

    `net_worth_snapshot` came across from the desktop import and
    `position_snapshot` did not, and nothing in the app wrote either — so every
    position chart asked for its series and got an empty list back.
    """
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date="2026-01-05", type="buy", units=2.0, eur_amount=100.0)
    )
    session.add(PriceCache(asset_id=asset, date="2026-01-05", price_eur=80.0, exchange_rate=1.1))
    session.commit()

    assert client.post("/api/prices/refresh").status_code == 200

    points = client.get(f"/api/positions/{asset}/history?period=1d").json()["points"]
    assert points, "a refresh must leave the position with a series to chart"
    latest = points[-1]
    assert latest["units_held"] == 2.0
    assert latest["invested_eur"] == 100.0
    assert latest["value_eur"] == latest["units_held"] * latest["price_eur"]


def test_the_backfill_builds_position_rows_for_imported_months(
    client: TestClient, session: Session
) -> None:
    """A month whose total was imported still needs its per-position rows.

    Skipping on `net_worth_snapshot` alone is exactly what left the charts empty,
    so the months carried over from the desktop ledger are the ones that matter.
    """
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date="2026-01-05", type="buy", units=2.0, eur_amount=100.0)
    )
    session.add(PriceCache(asset_id=asset, date="2026-01-05", price_eur=80.0, exchange_rate=1.1))
    # The imported total, with no rows behind it.
    session.add(NetWorthSnapshot(date="2026-01-31", total_eur=160.0, invested_eur=100.0))
    session.commit()

    assert client.post("/api/prices/refresh").status_code == 200

    dates = [
        p["date"]
        for p in client.get(f"/api/positions/{asset}/history?period=1d").json()["points"]
    ]
    assert "2026-01-31" in dates


def test_a_position_held_later_gets_no_row_for_earlier_months(
    client: TestClient, session: Session
) -> None:
    """Zero-unit rows would floor the chart at 0 for every month before the buy."""
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date="2026-03-05", type="buy", units=1.0, eur_amount=50.0)
    )
    session.add(PriceCache(asset_id=asset, date="2026-01-01", price_eur=40.0, exchange_rate=1.1))
    session.commit()

    assert client.post("/api/prices/refresh").status_code == 200

    points = client.get(f"/api/positions/{asset}/history?period=1d").json()["points"]
    assert points, "today's snapshot should still be recorded"
    assert all(p["date"] >= "2026-03-05" for p in points)
    assert all(p["units_held"] > 0 for p in points)


def _cash_asset(session: Session, units: float, date: str) -> int:
    """A cash position, funded on `date`. Cash has no price feed by design."""
    exchange = Exchange(name="Bank", type="bank")
    session.add(exchange)
    session.commit()
    asset = Asset(symbol="EUR", name="Euro", type="cash", exchange_id=exchange.id)
    session.add(asset)
    session.commit()
    session.add(
        Transaction(asset_id=asset.id, date=date, type="buy", units=units, eur_amount=units)
    )
    session.commit()
    return asset.id


def test_cash_counts_towards_the_charted_total(client: TestClient, session: Session) -> None:
    """The snapshot writer values only assets with a price feed, but `invested_eur`
    counts every transaction — so without cash on the value side the chart shows a
    portfolio permanently below its own cost basis by the cash balance.
    """
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date="2026-01-05", type="buy", units=2.0, eur_amount=100.0)
    )
    session.add(PriceCache(asset_id=asset, date="2026-01-05", price_eur=60.0, exchange_rate=1.1))
    session.commit()
    _cash_asset(session, units=500.0, date="2026-01-05")

    assert client.post("/api/prices/refresh").status_code == 200

    latest = client.get("/api/net-worth/?period=1d").json()["snapshots"][-1]
    assert latest["invested_eur"] == 600.0, "cost basis covers the cash deposit"
    assert latest["total_eur"] == 620.0, "2 units at 60 plus 500 cash"


def test_cash_reaches_totals_imported_without_it(client: TestClient, session: Session) -> None:
    """The rows carried over from the desktop ledger cannot be rewritten by the
    snapshot writer, so the cash side has to be added when the series is read.
    """
    _cash_asset(session, units=250.0, date="2026-01-02")
    session.add(NetWorthSnapshot(date="2026-01-31", total_eur=1000.0, invested_eur=1250.0))
    session.commit()

    latest = client.get("/api/net-worth/?period=1d").json()["snapshots"][-1]
    assert latest["total_eur"] == 1250.0


def test_cash_is_counted_as_of_each_date_not_today(
    client: TestClient, session: Session
) -> None:
    """A deposit must not retroactively lift the months before it."""
    _cash_asset(session, units=400.0, date="2026-02-10")
    session.add(NetWorthSnapshot(date="2026-01-31", total_eur=1000.0, invested_eur=1000.0))
    session.add(NetWorthSnapshot(date="2026-02-28", total_eur=1000.0, invested_eur=1400.0))
    session.commit()

    by_date = {
        s["date"]: s["total_eur"]
        for s in client.get("/api/net-worth/?period=1d").json()["snapshots"]
    }
    assert by_date["2026-01-31"] == 1000.0
    assert by_date["2026-02-28"] == 1400.0


# ── Daily gap fill ────────────────────────────────────────────────────────────


class _FakePriceService:
    """Stands in for the upstream feeds.

    `backfill_price_range` is the one method the gap fill calls; this records the
    windows it was asked for and writes the prices the test wants cached.
    """

    def __init__(self, prices: dict[str, float] | None = None) -> None:
        self.prices = prices or {}
        self.calls: list[tuple[int, str, str]] = []

    async def backfill_price_range(self, session: Session, asset, start: str, end: str) -> int:
        self.calls.append((asset.id, start, end))
        for date, price in self.prices.items():
            if start <= date <= end:
                session.add(
                    PriceCache(asset_id=asset.id, date=date, price_eur=price, exchange_rate=1.1)
                )
        session.commit()
        return len(self.prices)


def _use_fake_prices(monkeypatch, service: _FakePriceService) -> None:
    from app.services import snapshots as snapshots_module

    monkeypatch.setattr(snapshots_module, "get_price_service", lambda: service)


async def _gap_fill(session: Session, **kwargs) -> int:
    from app.services.snapshots import run_daily_gap_fill

    return await run_daily_gap_fill(session, **kwargs)


def test_gap_fill_writes_a_row_for_every_missed_day(
    session: Session, monkeypatch
) -> None:
    """The bug: a refresh records only the day it runs, so the days between two
    visits have no snapshot and the daily chart jumps straight across them.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    days = [(today - timedelta(days=offset)).isoformat() for offset in range(5)]
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=days[-1], type="buy", units=2.0, eur_amount=100.0)
    )
    session.commit()
    # Two visits, four days apart, and nothing in between.
    session.add(NetWorthSnapshot(date=days[-1], total_eur=100.0, invested_eur=100.0))
    session.commit()

    service = _FakePriceService({day: 60.0 for day in days})
    _use_fake_prices(monkeypatch, service)

    written = asyncio.run(_gap_fill(session, window_days=10))

    assert written == 4, "every day since the first visit, except the one already there"
    stored = {
        row.date for row in session.exec(text("SELECT date FROM net_worth_snapshot")).all()
    }
    assert stored == set(days)


def test_gap_fill_asks_each_source_for_the_whole_window_once(
    session: Session, monkeypatch
) -> None:
    """One ranged request per asset. Per-day fetching is what made filling a gap
    unaffordable in the first place.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    first = (today - timedelta(days=6)).isoformat()
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=first, type="buy", units=1.0, eur_amount=50.0)
    )
    session.commit()

    service = _FakePriceService(
        {(today - timedelta(days=offset)).isoformat(): 50.0 for offset in range(7)}
    )
    _use_fake_prices(monkeypatch, service)

    asyncio.run(_gap_fill(session, window_days=30))

    assert len(service.calls) == 1
    _, start, end = service.calls[0]
    assert (start, end) == (first, today.isoformat())


def test_gap_fill_skips_a_day_no_source_can_price(session: Session, monkeypatch) -> None:
    """A snapshot missing one held position is not a smaller portfolio, it is a
    wrong one — it would draw a cliff. Better no point than a false one.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    first = (today - timedelta(days=3)).isoformat()
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=first, type="buy", units=1.0, eur_amount=50.0)
    )
    session.commit()

    # Nothing priced at all, and no earlier price to carry forward.
    _use_fake_prices(monkeypatch, _FakePriceService({}))

    assert asyncio.run(_gap_fill(session, window_days=30)) == 0
    assert session.exec(text("SELECT COUNT(*) FROM net_worth_snapshot")).one()[0] == 0


def test_gap_fill_does_not_reach_back_before_the_first_transaction(
    session: Session, monkeypatch
) -> None:
    """An empty portfolio has no worth to record, and a row of zeroes would floor
    the chart for every day before the first buy.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    first = (today - timedelta(days=2)).isoformat()
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=first, type="buy", units=1.0, eur_amount=50.0)
    )
    session.commit()

    service = _FakePriceService(
        {(today - timedelta(days=offset)).isoformat(): 50.0 for offset in range(90)}
    )
    _use_fake_prices(monkeypatch, service)

    asyncio.run(_gap_fill(session, window_days=90))

    dates = [row.date for row in session.exec(text("SELECT date FROM net_worth_snapshot")).all()]
    assert min(dates) == first


def test_gap_fill_leaves_days_it_already_has_alone(session: Session, monkeypatch) -> None:
    """Idempotent: it runs on every refresh, and must not rewrite a day that was
    recorded from live quotes with one rebuilt from historical closes.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    first = (today - timedelta(days=2)).isoformat()
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=first, type="buy", units=1.0, eur_amount=50.0)
    )
    session.commit()
    session.add(NetWorthSnapshot(date=first, total_eur=999.0, invested_eur=50.0))
    session.commit()

    service = _FakePriceService(
        {(today - timedelta(days=offset)).isoformat(): 50.0 for offset in range(3)}
    )
    _use_fake_prices(monkeypatch, service)
    asyncio.run(_gap_fill(session, window_days=30))

    kept = session.exec(
        text("SELECT total_eur FROM net_worth_snapshot WHERE date = :d").bindparams(d=first)
    ).one()
    assert kept[0] == 999.0


def test_gap_fill_carries_a_price_across_a_closed_market(
    session: Session, monkeypatch
) -> None:
    """A weekend has no close because the exchange was shut, so Friday's price is
    the honest value for Saturday — this is what the snapshot writer already does.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    first = (today - timedelta(days=3)).isoformat()
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=first, type="buy", units=1.0, eur_amount=50.0)
    )
    session.commit()

    # Priced on the first day only; the three after it are within carry-forward.
    _use_fake_prices(monkeypatch, _FakePriceService({first: 60.0}))

    assert asyncio.run(_gap_fill(session, window_days=30)) == 4
    totals = session.exec(text("SELECT DISTINCT total_eur FROM net_worth_snapshot")).all()
    assert [row[0] for row in totals] == [60.0]


def test_gap_fill_will_not_stretch_one_price_across_weeks(
    session: Session, monkeypatch
) -> None:
    """Carrying a months-old price forward would draw a long flat line and call it
    history. A gap the feeds could not fill stays visibly empty instead.
    """
    import asyncio
    from datetime import date as date_cls
    from datetime import timedelta

    today = date_cls.today()
    first = (today - timedelta(days=60)).isoformat()
    asset = _asset(session)
    session.add(
        Transaction(asset_id=asset, date=first, type="buy", units=1.0, eur_amount=50.0)
    )
    session.commit()

    # One price, sixty days back, and nothing since.
    _use_fake_prices(monkeypatch, _FakePriceService({first: 60.0}))

    written = asyncio.run(_gap_fill(session, window_days=90))

    assert written == 6, "the day itself plus the five it may carry into"
    dates = [row.date for row in session.exec(text("SELECT date FROM net_worth_snapshot")).all()]
    assert max(dates) == (date_cls.fromisoformat(first) + timedelta(days=5)).isoformat()
