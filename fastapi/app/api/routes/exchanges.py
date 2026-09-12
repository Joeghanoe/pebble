from fastapi import APIRouter, Depends, HTTPException
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
    exchange = crud.get_exchange(session, exchange_id)
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    # An asset still pointing here would fail the foreign key and surface as a 500 with
    # nothing the user can act on. Name the assets instead so they know what to move.
    blocking = crud.list_assets_by_exchange(session, exchange_id)
    if blocking:
        symbols = ", ".join(a.symbol for a in blocking)
        raise HTTPException(
            status_code=409,
            detail=(
                f"{exchange.name} still holds {len(blocking)} "
                f"position{'s' if len(blocking) != 1 else ''} ({symbols}). "
                "Delete or move them first."
            ),
        )

    crud.delete_exchange(session, exchange)
    return {"ok": True}
