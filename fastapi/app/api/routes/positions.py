from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.db import get_session
from app.services.positions import build_positions

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("/")
def get_positions(session: Session = Depends(get_session)) -> dict:
    result = build_positions(session)
    return result.model_dump()
