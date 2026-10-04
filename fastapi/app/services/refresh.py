"""The price refresh, and the lease that keeps it to one run at a time everywhere.

Both the API route (someone opened the app or pressed the button) and the scheduled
job (`python -m app.jobs.refresh`) call `run_refresh`. Neither keeps any state in the
process: the cooldown and the in-flight marker live in `refresh_state` (migration
004), so any number of workers and replicas share one throttle on the upstreams.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlmodel import Session

from app import crud
from app.models import RefreshPricesResponse, RefreshResultItem
from app.services.btc_history import ensure_btc_daily_history
from app.services.price_service_factory import get_price_service
from app.services.snapshots import (
    record_snapshot_for_date,
    run_daily_gap_fill,
    run_snapshot_backfill,
)

# Quotes are a daily-resolution product here, so the background poll has no
# reason to run more than a handful of times a day.
REFRESH_COOLDOWN_S = 6 * 60 * 60

# A forced refresh is someone watching the spinner, so it ignores the cooldown
# above. This floor only stops a double-click or a stuck retry loop from
# hammering upstream; it is not a rate limit on the user.
FORCE_REFRESH_FLOOR_S = 60

# How long a claimed refresh may run before another process may assume it died.
# Generous: a first run backfills months of history through rate-limited APIs. A
# refresh that outlives it at worst overlaps a second one, and every write is an
# idempotent upsert.
LEASE_S = 15 * 60


@dataclass(frozen=True)
class Throttled:
    reason: str  # cooldown | in_progress
    next_allowed_at: str | None


def claim_refresh(session: Session, cooldown_s: int) -> Throttled | None:
    """Take the lease if no refresh is running and the cooldown has passed.

    One conditional UPDATE, so two processes racing for it cannot both win: Postgres
    serialises the row update and the loser's WHERE no longer matches. None means
    this caller holds the lease and must `release_refresh` it.
    """
    claimed = session.execute(
        text(
            """
            UPDATE refresh_state
               SET running_until = now() + make_interval(secs => :lease)
             WHERE id = 1
               AND (running_until IS NULL OR running_until < now())
               AND (last_success_at IS NULL
                    OR last_success_at < now() - make_interval(secs => :cooldown))
            RETURNING id
            """
        ),
        {"lease": LEASE_S, "cooldown": cooldown_s},
    ).first()
    session.commit()
    if claimed:
        return None

    row = session.execute(
        text("SELECT last_success_at, running_until, now() FROM refresh_state WHERE id = 1")
    ).one()
    last_success_at, running_until, now = row
    next_at = (
        (last_success_at + timedelta(seconds=cooldown_s)).astimezone(UTC).isoformat()
        if last_success_at
        else None
    )
    if running_until is not None and running_until >= now:
        return Throttled(reason="in_progress", next_allowed_at=next_at)
    return Throttled(reason="cooldown", next_allowed_at=next_at)


def release_refresh(session: Session, *, succeeded: bool) -> None:
    """Drop the lease; start the cooldown only if the run actually got a quote.

    Arming the cooldown on a run where every upstream failed is what produced the
    contradiction of prices 19 hours old behind a "wait" throttle: the failure locked
    out the retry that would have fixed it.
    """
    session.rollback()  # whatever the failed run left half-done is not ours to commit
    session.execute(
        text(
            """
            UPDATE refresh_state
               SET running_until = NULL,
                   last_success_at = CASE WHEN :ok THEN now() ELSE last_success_at END
             WHERE id = 1
            """
        ),
        {"ok": succeeded},
    )
    session.commit()


async def run_refresh(session: Session, *, force: bool = False) -> RefreshPricesResponse:
    cooldown = FORCE_REFRESH_FLOOR_S if force else REFRESH_COOLDOWN_S
    throttled = claim_refresh(session, cooldown)
    if throttled:
        return RefreshPricesResponse(
            throttled=True,
            reason=throttled.reason,
            next_allowed_at=throttled.next_allowed_at,
            results=[],
        )

    results: list[RefreshResultItem] = []
    try:
        price_service = get_price_service()
        for asset in crud.list_assets(session):
            result = await price_service.fetch_live_price(session, asset)
            results.append(RefreshResultItem(
                asset_id=asset.id,  # type: ignore[arg-type]
                symbol=asset.symbol,
                result=result.model_dump(),
            ))

        # Fresh quotes are the only moment the portfolio's value is known, so this
        # is where the history gets written. Today's row first (cheap, and uses the
        # quotes just fetched), then the days nobody opened the app -- a refresh is
        # the only thing that records a day -- then the month-end backfill, which
        # may reach upstream for prices it has no cache entry for. All idempotent.
        record_snapshot_for_date(session, datetime.now(UTC).date().isoformat())
        await run_daily_gap_fill(session)
        await run_snapshot_backfill(session)
        # A year of daily BTC closes for the strategy view's 200-day average. After
        # the first run this finds nothing missing and makes no request.
        await ensure_btc_daily_history(session)
    finally:
        release_refresh(
            session, succeeded=any(r.result.get("status") == "ok" for r in results)
        )

    return RefreshPricesResponse(throttled=False, results=results)
