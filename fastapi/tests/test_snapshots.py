"""The net-worth aggregation SQL, which had to be rewritten for Postgres.

`list_snapshots_aggregated` used SQLite's `strftime('%Y-%W', date)` / `'%Y-%m'` to pick
the last snapshot in each week or month. Postgres has neither, so the buckets are now
`to_char(date::date, 'IYYY-IW')` and a `substr` prefix. These tests pin the behaviour
that matters: one point per bucket, the latest in each, oldest first.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import NetWorthSnapshot


def _seed(session: Session, *dates: str) -> None:
    for i, date in enumerate(dates):
        session.add(
            NetWorthSnapshot(date=date, total_eur=1000.0 + i, invested_eur=500.0 + i)
        )
    session.commit()


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
