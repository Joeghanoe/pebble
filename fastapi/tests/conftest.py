"""Test fixtures.

The tests run against a real Postgres, not SQLite: the point of most of them is that
the raw SQL and the identity middleware behave the way they do in the deployment, and
a different engine would prove nothing. Point TEST_DATABASE_URL at a throwaway database
(docker-compose brings one up; see the repo README).
"""

import os

# Settings are read once at import time, so the environment has to be right before
# anything under `app` is imported.
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+psycopg://pebble@127.0.0.1:5432/pebble_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["ENVIRONMENT"] = "production"
os.environ["ALLOWED_EMAILS"] = "owner@example.com"
os.environ["REQUIRE_PROXY_IDENTITY"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlmodel import Session  # noqa: E402

from app.core.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.prestart import run_migrations  # noqa: E402

OWNER = "owner@example.com"
AUTH = {"X-Forwarded-Email": OWNER}

# Migration 001 seeds these two, so every test starts with them present.
SEEDED_EXCHANGE_IDS = (1, 2)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    run_migrations()


@pytest.fixture(autouse=True)
def _clean_tables() -> None:
    """Truncate between tests and put the seeded exchanges back.

    RESTART IDENTITY resets the sequences too, which is what lets each test assume
    ids start at 1 -- and incidentally exercises the same sequence alignment that
    migration 002 exists to fix.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                'TRUNCATE "transaction", price_cache, position_snapshot, '
                "net_worth_snapshot, asset, exchange RESTART IDENTITY CASCADE"
            )
        )
        conn.execute(
            text(
                "INSERT INTO exchange (id, name, type) VALUES "
                "(1, 'Crypto', 'crypto'), (2, 'Manual', 'manual')"
            )
        )
        conn.execute(
            text(
                "SELECT setval(pg_get_serial_sequence('exchange', 'id'), "
                "(SELECT MAX(id) FROM exchange))"
            )
        )


@pytest.fixture
def client() -> TestClient:
    """A client that carries the owner's identity, as the proxy would."""
    return TestClient(app, headers=AUTH)


@pytest.fixture
def anon() -> TestClient:
    """A client with no identity header, as a direct caller would be."""
    return TestClient(app)


@pytest.fixture
def session():
    with Session(engine) as s:
        yield s
