"""Input that used to reach the database and break it.

SQLite ignores declared VARCHAR lengths, so the desktop build happily stored a 40
character asset type in a VARCHAR(20) column. Postgres rejects the INSERT, which
reaches the user as a 500. The request models now constrain these fields, so the
answer is a 422 before anything touches the database.
"""

from fastapi.testclient import TestClient


def test_an_unknown_asset_type_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/assets/",
        json={
            "symbol": "BTC",
            "name": "Bitcoin",
            "type": "a-type-far-longer-than-the-twenty-character-column",
            "exchange_id": 1,
        },
    )
    assert response.status_code == 422


def test_an_unknown_exchange_type_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/exchanges/",
        json={"name": "Kraken", "type": "something-that-does-not-fit-in-twenty"},
    )
    assert response.status_code == 422


def test_an_unknown_transaction_type_is_rejected(client: TestClient) -> None:
    client.post(
        "/api/assets/",
        json={"symbol": "BTC", "name": "Bitcoin", "type": "crypto", "exchange_id": 1},
    )
    response = client.post(
        "/api/transactions/",
        json={
            "asset_id": 1,
            "date": "2026-01-10",
            "type": "transfer-in-which-is-not-a-thing-here",
            "units": 1,
            "eur_amount": 100,
        },
    )
    assert response.status_code == 422


def test_a_malformed_date_is_rejected(client: TestClient) -> None:
    """`date` is a 10 character column and the raw SQL sorts it as a string."""
    client.post(
        "/api/assets/",
        json={"symbol": "BTC", "name": "Bitcoin", "type": "crypto", "exchange_id": 1},
    )
    response = client.post(
        "/api/transactions/",
        json={
            "asset_id": 1,
            "date": "10 January 2026",
            "type": "buy",
            "units": 1,
            "eur_amount": 100,
        },
    )
    assert response.status_code == 422


def test_an_over_long_symbol_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/assets/",
        json={
            "symbol": "X" * 100,
            "name": "Bitcoin",
            "type": "crypto",
            "exchange_id": 1,
        },
    )
    assert response.status_code == 422


def test_valid_input_still_goes_through(client: TestClient) -> None:
    created = client.post(
        "/api/assets/",
        json={
            "symbol": "BTC",
            "name": "Bitcoin",
            "type": "crypto",
            "exchange_id": 1,
            "coingecko_id": "bitcoin",
        },
    )
    assert created.status_code == 201, created.text

    tx = client.post(
        "/api/transactions/",
        json={
            "asset_id": created.json()["asset"]["id"],
            "date": "2026-01-10",
            "type": "buy",
            "units": 0.5,
            "eur_amount": 20000,
        },
    )
    assert tx.status_code == 201, tx.text
