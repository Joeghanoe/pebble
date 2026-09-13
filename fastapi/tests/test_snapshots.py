"""The net-worth aggregation SQL, which had to be rewritten for Postgres.

`list_snapshots_aggregated` used SQLite's `strftime('%Y-%W', date)` / `'%Y-%m'` to pick
the last snapshot in each week or month. Postgres has neither, so the buckets are now
`to_char(date::date, 'IYYY-IW')` and a `substr` prefix. These tests pin the behaviour
that matters: one point per bucket, the latest in each, oldest first.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Asset, Exchange, NetWorthSnapshot, PositionSnapshot


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
