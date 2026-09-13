"""The API trusts identity only from the proxy header, and only for the owner."""

from fastapi.testclient import TestClient

from tests.conftest import OWNER


def test_health_is_open(anon: TestClient) -> None:
    """Railway probes this directly on the private network, with no proxy in front."""
    assert anon.get("/api/health").status_code == 200


def test_root_is_open(anon: TestClient) -> None:
    assert anon.get("/").status_code == 200


def test_request_without_identity_header_is_rejected(anon: TestClient) -> None:
    response = anon.get("/api/positions/")
    assert response.status_code == 401
    assert "auth proxy" in response.json()["detail"]


def test_malformed_identity_header_is_rejected(anon: TestClient) -> None:
    response = anon.get("/api/positions/", headers={"X-Forwarded-Email": "not-an-address"})
    assert response.status_code == 401


def test_address_outside_the_allowlist_is_rejected(anon: TestClient) -> None:
    response = anon.get("/api/positions/", headers={"X-Forwarded-Email": "someone@else.com"})
    assert response.status_code == 401
    assert "not allowed" in response.json()["detail"]


def test_owner_is_let_through(client: TestClient) -> None:
    assert client.get("/api/positions/").status_code == 200


def test_allowlist_is_case_insensitive(anon: TestClient) -> None:
    """Google can present a differently-cased address than the one configured."""
    response = anon.get("/api/positions/", headers={"X-Forwarded-Email": OWNER.upper()})
    assert response.status_code == 200


def test_me_reports_the_signed_in_address(client: TestClient) -> None:
    assert client.get("/api/me/").json() == {"email": OWNER}


def test_writes_are_gated_too(anon: TestClient) -> None:
    """A rejected request must not reach the database."""
    response = anon.post(
        "/api/exchanges/", json={"name": "Forged", "type": "crypto"}
    )
    assert response.status_code == 401
