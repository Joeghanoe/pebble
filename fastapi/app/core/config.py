from typing import Literal

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    # App settings
    PROJECT_NAME: str = "Pebble"
    API_V1_STR: str = "/api"
    ENVIRONMENT: Literal["local", "development", "production"] = "local"

    # Postgres. Railway injects DATABASE_URL as a reference to the Postgres service; the
    # default below is what docker-compose serves locally.
    DATABASE_URL: str = "postgresql+psycopg://pebble:pebble@localhost:5432/pebble"

    # Run Alembic migrations on startup. The API is the only writer of the schema.
    MIGRATE_ON_STARTUP: bool = True

    # --- Identity ---------------------------------------------------------------
    # Pebble trusts identity ONLY from the header oauth2-proxy forwards upstream with
    # --pass-user-headers. The API must never be reachable except through the proxy:
    # no public domain, private networking only. See app/core/identity.py.
    PROXY_EMAIL_HEADER: str = "X-Forwarded-Email"

    # Who may use this deployment. Pebble is single-tenant: one portfolio, one owner.
    # The proxy is the first gate (OAUTH2_PROXY_EMAIL_DOMAINS / --authenticated-emails-file);
    # this is the second, so a proxy misconfiguration alone does not hand over the ledger.
    # A comma-separated list; empty means every address the proxy lets through is accepted.
    # Kept as a string rather than list[str] because pydantic-settings JSON-decodes complex
    # types straight from the environment, and "a@b.com,c@d.com" is not JSON.
    ALLOWED_EMAILS: str = ""

    # Set to False only for local development without a proxy in front (see docker-compose).
    REQUIRE_PROXY_IDENTITY: bool = True

    # Price data. On the desktop build this came from the OS keyring; hosted, it is an
    # environment variable like every other secret.
    COINGECKO_API_KEY: str = ""

    @property
    def allowed_emails(self) -> frozenset[str]:
        """The allowlist, lowercased. Empty means "anyone the proxy lets through"."""
        return frozenset(
            part.strip().lower() for part in self.ALLOWED_EMAILS.split(",") if part.strip()
        )

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT in ("local", "development")

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """Normalise the URL Railway hands us into one SQLAlchemy accepts.

        Railway (and Heroku before it) sets `postgres://…`, which SQLAlchemy 2 rejects
        outright, and a bare `postgresql://` would pick psycopg2 rather than psycopg 3.
        """
        url = self.DATABASE_URL
        for prefix in ("postgresql+psycopg://", "postgresql+asyncpg://"):
            if url.startswith(prefix):
                return url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


settings = Settings()
