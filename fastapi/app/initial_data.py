"""Initialize database with default data. Called after migrations."""

from loguru import logger

from app.core.db import init_db


def init() -> None:
    init_db()


def main() -> None:
    logger.info("Initializing data")
    init()
    logger.info("Data initialization complete")


if __name__ == "__main__":
    main()
