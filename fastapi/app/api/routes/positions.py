from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import GetPositionHistoryResponse, PositionHistoryPoint
from app.services.positions import build_positions

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("/")
def get_positions(session: Session = Depends(get_session)) -> dict:
    result = build_positions(session)
    return result.model_dump()


@router.get("/{asset_id}/history")
def get_position_history(
    asset_id: int, period: str = "1m", session: Session = Depends(get_session)
) -> dict:
    """The value series behind one position's chart.

    Mirrors /net-worth: the same three granularities, the same fallback on an
    unknown period, and an empty list rather than a 404 for an asset with no
    snapshots yet — the chart renders its own empty state.
    """
    if period not in ("1d", "1w", "1m"):
        period = "1m"
    snapshots = crud.list_position_snapshots_aggregated(session, asset_id, period)
    return GetPositionHistoryResponse(
        points=[
            PositionHistoryPoint(
                date=s.date,
                units_held=s.units_held,
                price_eur=s.price_eur,
                value_eur=s.value_eur,
                invested_eur=s.invested_eur,
            )
            for s in snapshots
        ]
    ).model_dump()
