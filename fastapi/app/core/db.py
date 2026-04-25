import time
from collections.abc import Generator

from loguru import logger
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# Ensure data directory exists before creating engine
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    connect_args={"check_same_thread": False},
)


if settings.ENVIRONMENT == "local":

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ARG001
        conn.info.setdefault("query_start_time", []).append(time.time())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ARG001
        total = (time.time() - conn.info["query_start_time"].pop(-1)) * 1000
        sql = " ".join(statement.split())
        if parameters:
            sql = f"{sql} {parameters}"
        logger.info(f"SQL ({total:.2f}ms): {sql}")


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ARG001
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def init_db() -> None:
    """Load persisted API keys from keyring into environment on startup."""
    import os

    try:
        import keyring
        from app.services.price_service_factory import reset_price_service

        api_key = keyring.get_password("com.portfolio.desktop", "coingecko-api-key")
        if api_key:
            os.environ["COINGECKO_API_KEY"] = api_key
            reset_price_service()
            logger.info("Loaded CoinGecko API key from keyring")
    except Exception:
        pass
