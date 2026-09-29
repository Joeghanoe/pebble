"""Settings documents are stored whole and shared across devices."""

from fastapi.testclient import TestClient


def test_settings_start_empty(client: TestClient) -> None:
    """Nothing stored yet: the SPA keeps its own defaults."""
    assert client.get("/api/settings/").json() == {"preferences": None, "strategy": None}


def test_put_then_get_round_trips(client: TestClient) -> None:
    prefs = {"theme": "midnight", "refreshIntervalMinutes": 15}
    response = client.put("/api/settings/preferences", json=prefs)
    assert response.status_code == 200, response.text
    assert response.json()["value"] == prefs

    assert client.get("/api/settings/").json() == {"preferences": prefs, "strategy": None}


def test_put_replaces_the_whole_document(client: TestClient) -> None:
    """A write is the document, not a patch: a key left out is gone."""
    client.put("/api/settings/strategy", json={"targetAmount": 1, "includeCash": True})
    client.put("/api/settings/strategy", json={"targetAmount": 2})

    assert client.get("/api/settings/").json()["strategy"] == {"targetAmount": 2}


def test_nested_values_survive(client: TestClient) -> None:
    strategy = {"scenarios": {"bear": {"crypto": -0.3, "equity": 0}}, "birthdate": None}
    client.put("/api/settings/strategy", json=strategy)

    assert client.get("/api/settings/").json()["strategy"] == strategy


def test_unknown_document_is_rejected(client: TestClient) -> None:
    assert client.put("/api/settings/whatever", json={}).status_code == 422


def test_non_object_body_is_rejected(client: TestClient) -> None:
    assert client.put("/api/settings/preferences", json=[1, 2]).status_code == 422


def test_oversized_document_is_rejected(client: TestClient) -> None:
    response = client.put("/api/settings/preferences", json={"blob": "x" * 40_000})
    assert response.status_code == 413


def test_settings_are_gated(anon: TestClient) -> None:
    assert anon.get("/api/settings/").status_code == 401
    assert anon.put("/api/settings/preferences", json={}).status_code == 401


def test_export_includes_settings(client: TestClient) -> None:
    client.put("/api/settings/preferences", json={"theme": "dark"})

    assert client.get("/api/export/").json()["settings"] == {"preferences": {"theme": "dark"}}
