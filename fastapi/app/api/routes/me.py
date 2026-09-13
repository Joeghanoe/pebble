from fastapi import APIRouter, Request

from app.core.identity import current_email

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/")
def get_me(request: Request) -> dict:
    """Who the proxy says is calling, so the SPA can show the account and a sign-out link."""
    return {"email": current_email(request)}
