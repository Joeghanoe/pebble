from datetime import date as date_cls

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.models import Asset, Exchange, NetWorthSnapshot, Transaction

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/")
def export_db(session: Session = Depends(get_session)) -> JSONResponse:
    """Download the whole ledger as JSON.

    The desktop build handed over the SQLite file itself, which is not a thing a hosted
    Postgres deployment has. Soft-deleted transactions are included on purpose: this is
    a backup, and dropping them would make the export lossy.
    """
    payload = {
        "exported_at": date_cls.today().isoformat(),
        "exchanges": [e.model_dump() for e in session.exec(select(Exchange)).all()],
        "assets": [a.model_dump() for a in session.exec(select(Asset)).all()],
        "transactions": [
            t.model_dump()
            for t in session.exec(select(Transaction).order_by(Transaction.date, Transaction.id)).all()  # type: ignore[arg-type]
        ],
        "net_worth_snapshots": [
            s.model_dump()
            for s in session.exec(select(NetWorthSnapshot).order_by(NetWorthSnapshot.date)).all()  # type: ignore[arg-type]
        ],
    }
    filename = f"pebble-{date_cls.today().isoformat()}.json"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
