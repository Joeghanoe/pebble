"""The cooldown the client leans on.

Opening the app asks for quotes without forcing, and lets the server decide
whether that is a real pull or a no-op. That only works while these hold, so
they are pinned here rather than left as an implementation detail of the route:
the client has no clock of its own to fall back on.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.routes import prices


def _last_refreshed_hours_ago(hours: float) -> None:
    prices._last_refresh_at = (
        datetime.now(UTC).timestamp() - hours * 60 * 60
    )


def test_the_cooldown_is_six_hours() -> None:
    """The window the dashboard's 'refresh on visit' means."""
    assert prices.REFRESH_COOLDOWN_S == 6 * 60 * 60


def test_a_visit_inside_the_window_is_a_no_op(client: TestClient) -> None:
    _last_refreshed_hours_ago(1)

    body = client.post("/api/prices/refresh").json()

    assert body["throttled"] is True
    assert body["reason"] == "cooldown"
    assert body["results"] == [], "a throttled call must not have fetched anything"


def test_a_visit_after_the_window_pulls(client: TestClient) -> None:
    _last_refreshed_hours_ago(7)

    body = client.post("/api/prices/refresh").json()

    assert body["throttled"] is False


def test_the_button_still_works_inside_the_window(client: TestClient) -> None:
    """Somebody is watching the spinner, so a forced refresh ignores the six
    hours — it is only held off by the much shorter double-click floor.
    """
    _last_refreshed_hours_ago(1)

    body = client.post("/api/prices/refresh?force=true").json()

    assert body["throttled"] is False


def test_a_double_click_is_still_held_off(client: TestClient) -> None:
    """The floor under a forced refresh, so a stuck retry cannot hammer upstream."""
    seconds_ago = prices.FORCE_REFRESH_FLOOR_S / 2
    prices._last_refresh_at = datetime.now(UTC).timestamp() - seconds_ago

    body = client.post("/api/prices/refresh?force=true").json()

    assert body["throttled"] is True
    assert body["reason"] == "cooldown"
