"""Prestart: run migrations and initialize data. Called on application startup."""

import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from loguru import logger

from app.core.config import settings


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def run_migrations() -> None:
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

    if is_frozen():
        logger.info("Production build: creating database schema from models...")
        from sqlmodel import SQLModel

        from app.core.db import engine
        import app.models  # noqa: F401 — ensure all models are registered

        SQLModel.metadata.create_all(engine)
        logger.info("Database schema created")
        return

    logger.info("Running database migrations...")
    app_dir = Path(__file__).parent
    fastapi_dir = app_dir.parent
    alembic_ini = fastapi_dir / "alembic.ini"

    if not alembic_ini.exists():
        logger.warning(f"alembic.ini not found at {alembic_ini}, skipping migrations")
        return

    alembic_cfg = Config(str(alembic_ini))
    alembic_cfg.set_main_option("script_location", str(app_dir / "alembic"))
    command.upgrade(alembic_cfg, "head")
    logger.info("Migrations complete")


def run_initial_data() -> None:
    logger.info("Initializing data...")
    from app.initial_data import init
    init()
    logger.info("Data initialization complete")


def main() -> None:
    run_migrations()
    run_initial_data()


if __name__ == "__main__":
    from app.core.logging import setup_logging
    setup_logging()
    main()
