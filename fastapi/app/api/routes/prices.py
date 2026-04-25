import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import RefreshPricesResponse, RefreshResultItem
from app.services.price_service_factory import get_price_service
from app.services.snapshots import upsert_live_snapshot, run_price_correction_backfill, run_full_snapshot_recompute

router = APIRouter(prefix="/prices", tags=["prices"])

REFRESH_COOLDOWN_S = 15 * 60
_last_refresh_at: float = 0
_active_refresh: asyncio.Task | None = None  # type: ignore[type-arg]


@router.post("/refresh")
async def refresh_prices(session: Session = Depends(get_session)) -> dict:
    global _last_refresh_at, _active_refresh

    now = datetime.now(timezone.utc).timestamp()

    if _active_refresh and not _active_refresh.done():
        next_at = datetime.fromtimestamp(_last_refresh_at + REFRESH_COOLDOWN_S, tz=timezone.utc).isoformat()
        return RefreshPricesResponse(
            throttled=True,
            reason="in_progress",
            next_allowed_at=next_at,
            results=[],
        ).model_dump()

    if _last_refresh_at > 0 and now - _last_refresh_at < REFRESH_COOLDOWN_S:
        next_at = datetime.fromtimestamp(_last_refresh_at + REFRESH_COOLDOWN_S, tz=timezone.utc).isoformat()
        return RefreshPricesResponse(
            throttled=True,
            reason="cooldown",
            next_allowed_at=next_at,
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

    _last_refresh_at = datetime.now(timezone.utc).timestamp()
    upsert_live_snapshot(session)
    return RefreshPricesResponse(throttled=False, results=results).model_dump()


@router.post("/backfill")
async def backfill_prices(session: Session = Depends(get_session)) -> dict:
    """Correct historical prices stored with the fallback exchange rate, then
    wipe and recompute all net-worth snapshots from scratch."""
    corrected = await run_price_correction_backfill(session)
    await run_full_snapshot_recompute(session)
    return {"corrected_prices": corrected}
