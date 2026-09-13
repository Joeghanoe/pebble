import time
from collections.abc import Generator

from loguru import logger
from sqlalchemy import event
from sqlmodel import Session, create_engine

from app.core.config import settings

# Railway recycles Postgres connections behind the scenes, so a pooled connection can be
# dead by the time a request picks it up; pre_ping costs one round trip and turns that
# into a transparent reconnect instead of a 500. recycle keeps connections short-lived
# enough that the proxy never closes one mid-query.
engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True,
    pool_recycle=1800,
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


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
