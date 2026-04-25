import calendar
from datetime import date as date_cls, timedelta

from sqlmodel import Session

from app import crud
from app.services.price_service_factory import get_price_service


def _end_of_month(d: date_cls) -> date_cls:
    last_day = calendar.monthrange(d.year, d.month)[1]
    return d.replace(day=last_day)


def _add_month(d: date_cls) -> date_cls:
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1, day=1)
    return d.replace(month=d.month + 1, day=1)


async def run_snapshot_backfill(session: Session) -> None:
    earliest = crud.get_earliest_transaction_date(session)
    if not earliest:
        return

    assets = [a for a in crud.list_assets(session) if a.type != "cash"]
    if not assets:
        return

    price_service = get_price_service()
    today = date_cls.today()
    cursor = _end_of_month(date_cls.fromisoformat(earliest))

    while cursor <= today:
        date_str = cursor.isoformat()

        if crud.get_snapshot(session, date_str) is None:
            total_eur = 0.0
            all_prices_available = True

            for asset in assets:
                units = crud.get_units_held_on_date(session, asset.id, date_str)  # type: ignore[arg-type]
                if units <= 0:
                    continue

                price_row = crud.get_price_on_or_before(session, asset.id, date_str)  # type: ignore[arg-type]
                if not price_row:
                    await price_service.fetch_historical_price(session, asset, date_str)
                    price_row = crud.get_price_on_or_before(session, asset.id, date_str)  # type: ignore[arg-type]

                if not price_row:
                    all_prices_available = False
                    break
                total_eur += units * price_row.price_eur

            if all_prices_available:
                invested = crud.get_invested_eur_on_date(session, date_str)
                crud.upsert_snapshot(session, date_str, total_eur, invested)

        next_month_start = _add_month(cursor.replace(day=1))
        cursor = _end_of_month(next_month_start)
        if cursor > today:
            break
