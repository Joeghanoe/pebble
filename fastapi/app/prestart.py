"""Prestart: bring the database schema up to date. Called on application startup."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from loguru import logger

from app.core.config import settings


def run_migrations() -> None:
    """Upgrade to head. The API is the only writer of the schema."""
    app_dir = Path(__file__).parent
    alembic_ini = app_dir.parent / "alembic.ini"

    if not alembic_ini.exists():
        logger.error(f"alembic.ini not found at {alembic_ini}; refusing to start on an unknown schema")
        raise RuntimeError(f"alembic.ini not found at {alembic_ini}")

    logger.info("Running database migrations...")
    alembic_cfg = Config(str(alembic_ini))
    alembic_cfg.set_main_option("script_location", str(app_dir / "alembic"))
    command.upgrade(alembic_cfg, "head")
    logger.info("Migrations complete")


def main() -> None:
    if not settings.MIGRATE_ON_STARTUP:
        logger.info("MIGRATE_ON_STARTUP is off; leaving the schema alone")
        return
    run_migrations()


if __name__ == "__main__":
    from app.core.logging import setup_logging

    setup_logging()
    main()
