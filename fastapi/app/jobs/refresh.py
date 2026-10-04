"""Scheduled price refresh: `python -m app.jobs.refresh`.

Runs on a cron (the `jobs` service in .railway/railway.ts) so the net-worth history
gains a point every day whether or not anyone opens the app. It talks to Postgres
directly rather than calling the API: the API only trusts requests that come through
oauth2-proxy, and a job that forged the identity header to get past that would be
exactly the hole the proxy exists to close.

It shares the lease with the API, so a refresh someone started a minute ago makes this
a no-op rather than a second pull. It never migrates the schema; the API owns that.
Exits non-zero only when the refresh itself raised, so the platform shows a failed run.
"""

import asyncio

from loguru import logger
from sqlmodel import Session

from app.core.db import engine
from app.core.logging import setup_logging
from app.services.refresh import run_refresh


async def main() -> None:
    with Session(engine) as session:
        response = await run_refresh(session)
    if response.throttled:
        logger.info("Refresh skipped: {} (next at {})", response.reason, response.next_allowed_at)
        return
    ok = sum(1 for r in response.results if r.result.get("status") == "ok")
    logger.info("Refreshed {} of {} assets", ok, len(response.results))


if __name__ == "__main__":
    setup_logging()
    asyncio.run(main())
    engine.dispose()
