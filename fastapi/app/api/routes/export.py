from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse
from datetime import date as date_cls

from app.core.config import settings

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/")
def export_db() -> FileResponse:
    db_path = settings.DATA_DIR / settings.DATABASE_NAME
    filename = f"portfolio-{date_cls.today().isoformat()}.db"
    return FileResponse(
        path=str(db_path),
        media_type="application/x-sqlite3",
        filename=filename,
    )
