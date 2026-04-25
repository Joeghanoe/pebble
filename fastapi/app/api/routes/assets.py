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
    asset = crud.get_asset(session, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Not found")
    updated = crud.update_asset(session, asset, body)
    return {"asset": updated}
