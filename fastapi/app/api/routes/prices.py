from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import BtcDailyClose, GetBtcDailyResponse
from app.services.btc_history import btc_history_start
from app.services.refresh import run_refresh

router = APIRouter(prefix="/prices", tags=["prices"])


@router.post("/refresh")
async def refresh_prices(
    session: Session = Depends(get_session),
    force: bool = Query(
        False,
        description="Bypass the routine cooldown. For an explicit user-initiated refresh.",
    ),
) -> dict:
    """Pull live quotes unless another process did so recently or is doing so now.

    The throttle is shared through Postgres (see app/services/refresh.py), so it
    holds across workers, replicas and the scheduled job.
    """
    return (await run_refresh(session, force=force)).model_dump()


@router.get("/btc/daily")
def get_btc_daily(session: Session = Depends(get_session)) -> dict:
    """The last year of daily BTC closes in EUR, oldest first, as cached.

    Returned as stored, gaps and all: the strategy view decides how far a close
    may be carried forward, and refuses to compute a regime over a real hole.
    Empty when the portfolio holds no BTC.
    """
    btc = crud.get_btc_asset(session)
    if not btc:
        return GetBtcDailyResponse(closes=[]).model_dump()
    start = btc_history_start(date.today())
    rows = crud.list_prices_since(session, btc.instrument_id, start)
    return GetBtcDailyResponse(
        closes=[BtcDailyClose(date=r.date, price_eur=r.price_eur) for r in rows]
    ).model_dump()
