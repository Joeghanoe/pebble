from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import AssetCreate, AssetUpdate

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("/")
def list_assets(session: Session = Depends(get_session)) -> dict:
    return {"assets": crud.list_assets(session)}


@router.post("/", status_code=201)
def create_asset(body: AssetCreate, session: Session = Depends(get_session)) -> dict:
    asset = crud.create_asset(session, body)
    return {"asset": asset}


@router.get("/{asset_id}")
def get_asset(asset_id: int, session: Session = Depends(get_session)) -> dict:
    asset = crud.get_asset(session, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Not found")
    return {"asset": asset}


@router.put("/{asset_id}")
def update_asset(asset_id: int, body: AssetUpdate, session: Session = Depends(get_session)) -> dict:
    updated = crud.update_asset(session, asset_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Not found")
    return {"asset": updated}


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, session: Session = Depends(get_session)) -> dict:
    """Delete a position outright, with its transactions and snapshots.

    Cached prices stay with the instrument, which other positions may share.
    """
    if not crud.delete_asset(session, asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"ok": True}
