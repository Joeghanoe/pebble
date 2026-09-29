from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import crud
from app.core.db import get_session
from app.models import GetVenuesResponse, VenueRename, VenueSummary

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("/")
def list_venues(session: Session = Depends(get_session)) -> dict:
    """Every venue a transaction names. There is no venue table: a venue exists
    for as long as something happened there, and is created by typing its name."""
    return GetVenuesResponse(
        venues=[VenueSummary(name=name, transactions=n) for name, n in crud.list_venues(session)]
    ).model_dump()


@router.post("/rename")
def rename_venue(body: VenueRename, session: Session = Depends(get_session)) -> dict:
    """Rename a venue everywhere it is used; onto an existing name, the two merge."""
    changed = crud.rename_venue(session, body.from_name, body.to_name)
    if changed == 0:
        raise HTTPException(status_code=404, detail=f"No transaction is at {body.from_name}.")
    return {"changed": changed}
