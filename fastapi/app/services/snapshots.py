import calendar
from datetime import date as date_cls

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


def _priced_assets(session: Session) -> list:
    """Assets a snapshot can value. Cash has no price feed and no chart."""
    return [a for a in crud.list_assets(session) if a.type != "cash"]


def _write_position_row(session: Session, asset, date_str: str, price_eur: float) -> float:
    """Records one position's state on a date and returns its value.

    Returns 0.0 without writing when nothing was held: a row of zeroes would put
    a floor on the position chart for every month before the first buy.
    """
    units = crud.get_units_held_on_date(session, asset.id, date_str)
    if units <= 0:
        return 0.0
    value = units * price_eur
    crud.upsert_position_snapshot(
        session,
        date=date_str,
        asset_id=asset.id,
        units_held=units,
        price_eur=price_eur,
        value_eur=value,
        invested_eur=crud.get_invested_eur_on_date(session, date_str, asset_id=asset.id),
    )
    return value


def record_snapshot_for_date(session: Session, date_str: str) -> None:
    """Snapshots the portfolio from prices already in the cache.

    Deliberately does no network work: this runs at the end of a price refresh,
    where the quotes it needs were just written. A date with no cached price for
    a held asset is skipped rather than guessed at.
    """
    total_eur = 0.0
    for asset in _priced_assets(session):
        price_row = crud.get_price_on_or_before(session, asset.id, date_str)
        if not price_row:
            continue
        total_eur += _write_position_row(session, asset, date_str, price_row.price_eur)

    crud.upsert_snapshot(
        session, date_str, total_eur, crud.get_invested_eur_on_date(session, date_str)
    )


async def run_snapshot_backfill(session: Session) -> None:
    """Fills in month-end history, fetching prices for months it has none for.

    Month ends rather than days because each missing price is a call to an
    upstream feed, and a daily walk over a multi-year ledger is thousands of
    them. The live snapshot at the end of every refresh supplies the recent
    detail.

    A month is skipped only when both tables already hold it. `net_worth_snapshot`
    alone is not enough: the import from the desktop ledger brought the portfolio
    totals across and nothing has ever written `position_snapshot`, so every one
    of those months needs its per-position rows built even though the total is
    already there.
    """
    earliest = crud.get_earliest_transaction_date(session)
    if not earliest:
        return

    assets = _priced_assets(session)
    if not assets:
        return

    price_service = get_price_service()
    today = date_cls.today()
    cursor = _end_of_month(date_cls.fromisoformat(earliest))

    while cursor <= today:
        date_str = cursor.isoformat()
        already_done = crud.get_snapshot(
            session, date_str
        ) is not None and crud.has_position_snapshots_on_date(session, date_str)

        if not already_done:
            total_eur = 0.0
            all_prices_available = True

            for asset in assets:
                units = crud.get_units_held_on_date(session, asset.id, date_str)
                if units <= 0:
                    continue

                price_row = crud.get_price_on_or_before(session, asset.id, date_str)
                if not price_row:
                    await price_service.fetch_historical_price(session, asset, date_str)
                    price_row = crud.get_price_on_or_before(session, asset.id, date_str)

                if not price_row:
                    all_prices_available = False
                    break

                total_eur += _write_position_row(session, asset, date_str, price_row.price_eur)

            # The portfolio total is only honest when every held asset was priced;
            # the position rows written above stand on their own either way.
            if all_prices_available and crud.get_snapshot(session, date_str) is None:
                invested = crud.get_invested_eur_on_date(session, date_str)
                crud.upsert_snapshot(session, date_str, total_eur, invested)

        next_month_start = _add_month(cursor.replace(day=1))
        cursor = _end_of_month(next_month_start)
        if cursor > today:
            break
