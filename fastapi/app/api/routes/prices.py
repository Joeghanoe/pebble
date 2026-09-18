import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import RefreshPricesResponse, RefreshResultItem
from app.services.price_service_factory import get_price_service
from app.services.snapshots import (
    record_snapshot_for_date,
    run_daily_gap_fill,
    run_snapshot_backfill,
)

router = APIRouter(prefix="/prices", tags=["prices"])

# Quotes are a daily-resolution product here, so the background poll has no
# reason to run more than a handful of times a day.
REFRESH_COOLDOWN_S = 6 * 60 * 60

# A forced refresh is someone watching the spinner, so it ignores the cooldown
# above. This floor only stops a double-click or a stuck retry loop from
# hammering upstream; it is not a rate limit on the user.
FORCE_REFRESH_FLOOR_S = 60

_last_refresh_at: float = 0
_active_refresh: asyncio.Task | None = None  # type: ignore[type-arg]


@router.post("/refresh")
async def refresh_prices(
    session: Session = Depends(get_session),
    force: bool = Query(
        False,
        description="Bypass the routine cooldown. For an explicit user-initiated refresh.",
    ),
) -> dict:
    global _last_refresh_at, _active_refresh

    now = datetime.now(timezone.utc).timestamp()
    cooldown = FORCE_REFRESH_FLOOR_S if force else REFRESH_COOLDOWN_S

    def _next_at() -> str:
        return datetime.fromtimestamp(_last_refresh_at + cooldown, tz=timezone.utc).isoformat()

    if _active_refresh and not _active_refresh.done():
        return RefreshPricesResponse(
            throttled=True,
            reason="in_progress",
            next_allowed_at=_next_at(),
            results=[],
        ).model_dump()

    if _last_refresh_at > 0 and now - _last_refresh_at < cooldown:
        return RefreshPricesResponse(
            throttled=True,
            reason="cooldown",
            next_allowed_at=_next_at(),
            results=[],
        ).model_dump()

    assets = crud.list_assets(session)
    price_service = get_price_service()
    results: list[RefreshResultItem] = []

    for asset in assets:
        result = await price_service.fetch_live_price(session, asset)
        results.append(RefreshResultItem(
            asset_id=asset.id,  # type: ignore[arg-type]
            symbol=asset.symbol,
            result=result.model_dump(),
        ))

    # Fresh quotes are the only moment the portfolio's value is known, so this is
    # where the history gets written. Nothing else in the app did, which is why
    # `position_snapshot` was empty and every position chart came back with no
    # points: the table existed and had no writer.
    #
    # Today's row first (cheap, and uses the quotes just fetched), then the
    # month-end backfill, which may reach upstream for prices it has no cache
    # entry for. Both are idempotent, and the cooldown above bounds how often
    # they run.
    # Then the days nobody opened the app: a refresh is the only thing that
    # records a day, so every stretch of not looking is a hole in the daily
    # chart. One ranged request per asset closes them.
    record_snapshot_for_date(session, datetime.now(timezone.utc).date().isoformat())
    await run_daily_gap_fill(session)
    await run_snapshot_backfill(session)

    # Only a refresh that actually got a quote starts the clock. Arming the
    # cooldown on a run where every upstream failed is what produced the
    # contradiction of prices 19 hours old behind a "wait 15 minutes" throttle:
    # the failure locked out the retry that would have fixed it.
    if any(r.result.get("status") == "ok" for r in results):
        _last_refresh_at = datetime.now(timezone.utc).timestamp()

    return RefreshPricesResponse(throttled=False, results=results).model_dump()
