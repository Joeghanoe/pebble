import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.core.db import get_session
from app.models import Setting, SettingName, SettingsResponse

router = APIRouter(prefix="/settings", tags=["settings"])

# The real documents are well under 2 KB. The cap only stops a runaway client from
# parking megabytes in a row every page load reads.
MAX_SETTING_BYTES = 32 * 1024


@router.get("/")
def get_settings(session: Session = Depends(get_session)) -> SettingsResponse:
    rows = session.exec(select(Setting)).all()
    return SettingsResponse(**{row.name: row.value for row in rows})


@router.put("/{name}")
def put_setting(
    name: SettingName,
    value: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> dict:
    """Replace one settings document whole. Last write wins: there is one owner."""
    if len(json.dumps(value)) > MAX_SETTING_BYTES:
        raise HTTPException(status_code=413, detail="Settings document is too large.")

    updated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    # An upsert rather than get-then-add: two tabs saving at once must not race into a
    # duplicate-key 500.
    statement = insert(Setting).values(name=name, value=value, updated_at=updated_at)
    session.exec(  # type: ignore[call-overload]
        statement.on_conflict_do_update(
            index_elements=[Setting.name],
            set_={"value": statement.excluded.value, "updated_at": updated_at},
        )
    )
    session.commit()
    return {"name": name, "value": value, "updated_at": updated_at}
