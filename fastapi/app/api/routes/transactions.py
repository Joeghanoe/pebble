from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import TransactionCreate, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/", status_code=201)
def create_transaction(body: TransactionCreate, session: Session = Depends(get_session)) -> dict:
    tx = crud.create_transaction(session, body)
    return {"transaction": tx}


@router.get("/{asset_id}")
def list_transactions(asset_id: int, session: Session = Depends(get_session)) -> dict:
    return {"transactions": crud.list_transactions_by_asset(session, asset_id)}


@router.put("/{tx_id}/update")
def update_transaction(tx_id: int, body: TransactionUpdate, session: Session = Depends(get_session)) -> dict:
    tx = crud.get_transaction(session, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    crud.update_transaction(session, tx, body)
    return {"ok": True}


@router.delete("/{tx_id}/delete")
def delete_transaction(tx_id: int, session: Session = Depends(get_session)) -> dict:
    tx = crud.get_transaction(session, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    crud.soft_delete_transaction(session, tx)
    return {"ok": True}
