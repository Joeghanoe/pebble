"""The cooldown the client leans on, and the lease that makes it hold everywhere.

Opening the app asks for quotes without forcing, and lets the server decide
whether that is a real pull or a no-op. That only works while these hold, so
they are pinned here rather than left as an implementation detail of the route:
the client has no clock of its own to fall back on.

The state lives in Postgres (`refresh_state`), not the process, so these also pin
that two workers or replicas cannot both refresh at once.
"""

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine
from app.services import refresh
from app.services.refresh import claim_refresh, release_refresh


def _set_state(sql: str) -> None:
    with engine.begin() as conn:
        conn.execute(text(f"UPDATE refresh_state SET {sql} WHERE id = 1"))


def _last_refreshed_seconds_ago(seconds: float) -> None:
    _set_state(f"last_success_at = now() - make_interval(secs => {seconds})")


def _last_refreshed_hours_ago(hours: float) -> None:
    _last_refreshed_seconds_ago(hours * 60 * 60)


def test_the_cooldown_is_six_hours() -> None:
    """The window the dashboard's 'refresh on visit' means."""
    assert refresh.REFRESH_COOLDOWN_S == 6 * 60 * 60


def test_a_visit_inside_the_window_is_a_no_op(client: TestClient) -> None:
    _last_refreshed_hours_ago(1)

    body = client.post("/api/v1/prices/refresh").json()

    assert body["throttled"] is True
    assert body["reason"] == "cooldown"
    assert body["next_allowed_at"] is not None
    assert body["results"] == [], "a throttled call must not have fetched anything"


def test_a_visit_after_the_window_pulls(client: TestClient) -> None:
    _last_refreshed_hours_ago(7)

    body = client.post("/api/v1/prices/refresh").json()

    assert body["throttled"] is False


def test_the_button_still_works_inside_the_window(client: TestClient) -> None:
    """Somebody is watching the spinner, so a forced refresh ignores the six
    hours — it is only held off by the much shorter double-click floor.
    """
    _last_refreshed_hours_ago(1)

    body = client.post("/api/v1/prices/refresh?force=true").json()

    assert body["throttled"] is False


def test_a_double_click_is_still_held_off(client: TestClient) -> None:
    """The floor under a forced refresh, so a stuck retry cannot hammer upstream."""
    _last_refreshed_seconds_ago(refresh.FORCE_REFRESH_FLOOR_S / 2)

    body = client.post("/api/v1/prices/refresh?force=true").json()

    assert body["throttled"] is True
    assert body["reason"] == "cooldown"


def test_a_refresh_in_flight_holds_off_even_a_forced_one(client: TestClient) -> None:
    """Another worker or replica holding the lease, as far as this one can tell."""
    _set_state("running_until = now() + interval '5 minutes'")

    body = client.post("/api/v1/prices/refresh?force=true").json()

    assert body["throttled"] is True
    assert body["reason"] == "in_progress"


def test_an_expired_lease_does_not_block(client: TestClient) -> None:
    """A process that died mid-refresh must not lock refreshes out forever."""
    _set_state("running_until = now() - interval '1 second'")

    body = client.post("/api/v1/prices/refresh?force=true").json()

    assert body["throttled"] is False


def test_a_finished_refresh_releases_the_lease(client: TestClient) -> None:
    client.post("/api/v1/prices/refresh")

    with engine.connect() as conn:
        running_until = conn.execute(
            text("SELECT running_until FROM refresh_state")
        ).scalar_one()
    assert running_until is None


def test_a_run_without_quotes_does_not_start_the_cooldown(session: Session) -> None:
    """No assets, so no `ok` quote: the next visit must still be allowed to try."""
    assert claim_refresh(session, refresh.REFRESH_COOLDOWN_S) is None
    release_refresh(session, succeeded=False)

    assert claim_refresh(session, refresh.REFRESH_COOLDOWN_S) is None
    release_refresh(session, succeeded=True)

    throttled = claim_refresh(session, refresh.REFRESH_COOLDOWN_S)
    assert throttled is not None and throttled.reason == "cooldown"


def test_racing_processes_get_exactly_one_lease() -> None:
    """Eight workers claim at once; Postgres lets exactly one through."""

    def claim(_: int) -> bool:
        with Session(engine) as s:
            return claim_refresh(s, refresh.FORCE_REFRESH_FLOOR_S) is None

    with ThreadPoolExecutor(max_workers=8) as pool:
        winners = sum(pool.map(claim, range(8)))

    assert winners == 1
