import secrets
from pathlib import Path
from typing import Literal

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_default_data_dir() -> Path:
    """Get default data directory (project root .data in dev)."""
    # From fastapi/app/core/config.py, go up 3 levels to project root
    project_root = Path(__file__).resolve().parent.parent.parent
    data_dir = project_root / ".data"
    return data_dir if data_dir.exists() else Path(".data")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    # App settings
    PROJECT_NAME: str = "Portfolio Tracker"
    API_V1_STR: str = "/api"
    ENVIRONMENT: Literal["local", "development", "production"] = "local"

    # Auth disabled for local desktop use
    AUTH_REQUIRED: bool = False
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database settings (SQLite)
    # DATA_DIR is passed from Tauri (app_data_dir) or defaults to project root .data in dev
    DATA_DIR: Path = _get_default_data_dir()
    DATABASE_NAME: str = "portfolio.db"

    @property
    def is_dev(self) -> bool:
        """Check if running in development mode."""
        return self.ENVIRONMENT in ("local", "development")

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        db_path = self.DATA_DIR / self.DATABASE_NAME
        return f"sqlite:///{db_path}"

    # Server settings
    HOST: str = "127.0.0.1"
    PORT: int = 1430

    # CoinGecko API key (stored in keyring, loaded into env on startup)
    COINGECKO_API_KEY: str = ""


settings = Settings()
