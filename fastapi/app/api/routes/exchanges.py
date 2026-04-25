from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import ExchangeCreate

router = APIRouter(prefix="/exchanges", tags=["exchanges"])


@router.get("/")
def list_exchanges(session: Session = Depends(get_session)) -> dict:
    return {"exchanges": crud.list_exchanges(session)}


@router.post("/", status_code=201)
def create_exchange(body: ExchangeCreate, session: Session = Depends(get_session)) -> dict:
    exchange = crud.create_exchange(session, body)
    return {"exchange": exchange}


@router.delete("/{exchange_id}")
def delete_exchange(exchange_id: int, session: Session = Depends(get_session)) -> dict:
    crud.delete_exchange(session, exchange_id)
    return {"ok": True}
