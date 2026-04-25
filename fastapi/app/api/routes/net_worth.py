from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import GetNetWorthResponse, SnapshotRow

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


@router.get("/")
def get_net_worth(period: str = "1m", session: Session = Depends(get_session)) -> dict:
    if period not in ("1d", "1w", "1m"):
        period = "1m"
    snapshots = crud.list_snapshots_aggregated(session, period)
    return GetNetWorthResponse(
        snapshots=[SnapshotRow(date=s.date, total_eur=s.total_eur, invested_eur=s.invested_eur) for s in snapshots]
    ).model_dump()
