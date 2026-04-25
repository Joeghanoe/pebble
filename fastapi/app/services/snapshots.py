import calendar
from datetime import date as date_cls, timedelta

from sqlalchemy import text
from sqlmodel import Session

from app import crud
from app.clients.stooq import is_eur_listing
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

    # Phase 1: ensure end-of-month prices are in the cache for every month in
    # the range.  This limits expensive API calls to ~1 call per asset per month
    # rather than one per day.
    monthly_cursor = _end_of_month(date_cls.fromisoformat(earliest))
    while monthly_cursor <= today:
        for asset in assets:
            # Check for a price within this specific calendar month — not just
            # any older entry — so stale prices from prior months don't prevent
            # fetching the correct month-end price.
            if not crud.get_price_in_month(session, asset.id, monthly_cursor.year, monthly_cursor.month):  # type: ignore[arg-type]
                await price_service.fetch_historical_price(session, asset, monthly_cursor.isoformat())
        next_month_start = _add_month(monthly_cursor.replace(day=1))
        monthly_cursor = _end_of_month(next_month_start)
        if monthly_cursor > today:
            break

    # Phase 2: generate a snapshot for every calendar day using the nearest
    # cached price (no additional API calls).  For days before the first cached
    # price entry, get_price_on_or_before returns None and we skip that day.
    cursor = date_cls.fromisoformat(earliest)
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
                    all_prices_available = False
                    break
                total_eur += units * price_row.price_eur

            if all_prices_available:
                invested = crud.get_invested_eur_on_date(session, date_str)
                crud.upsert_snapshot(session, date_str, total_eur, invested)

        cursor += timedelta(days=1)


async def run_price_correction_backfill(session: Session) -> int:
    """Correct price_cache entries stored with the fallback 1.1 exchange rate.

    For non-EUR-listed ETF/stock assets the price was computed as
    ``usd_price / 1.1``. This re-fetches the real EUR/USD rate for every
    affected (asset_id, date) pair and recalculates price_eur in-place using:
        new_price_eur = stored_price_eur * 1.1 / real_rate

    Returns the number of rows corrected.
    """
    assets = crud.list_assets(session)
    non_eur_ids: set[int] = {
        a.id  # type: ignore[misc]
        for a in assets
        if a.type in ("etf", "stock")
        and a.yahoo_ticker
        and not is_eur_listing(a.yahoo_ticker)
    }
    if not non_eur_ids:
        return 0

    # All price_cache rows that were saved with the fallback rate
    rows = session.exec(
        text(
            "SELECT asset_id, date, price_eur FROM price_cache "
            "WHERE ABS(exchange_rate - 1.1) < 0.0001"
        )
    ).all()
    affected = [(r[0], r[1], r[2]) for r in rows if r[0] in non_eur_ids]
    if not affected:
        return 0

    price_svc = get_price_service()
    rate_map: dict[str, float] = {}
    for date_str in sorted({date for _, date, _ in affected}):
        try:
            rate = await price_svc.currency.get_eur_usd_rate(date_str)
            rate_map[date_str] = rate
        except Exception:
            pass  # keep original if we can't fetch the rate

    corrected = 0
    for asset_id, date_str, price_eur in affected:
        real_rate = rate_map.get(date_str)
        if real_rate is None or abs(real_rate - 1.1) < 0.0001:
            continue  # rate unchanged or unavailable — nothing to fix
        new_price_eur = price_eur * 1.1 / real_rate
        session.exec(
            text(
                "UPDATE price_cache SET price_eur = :p, exchange_rate = :r "
                "WHERE asset_id = :aid AND date = :d"
            ).bindparams(p=new_price_eur, r=real_rate, aid=asset_id, d=date_str)
        )
        corrected += 1

    session.commit()
    return corrected


async def run_full_snapshot_recompute(session: Session) -> None:
    """Wipe all net_worth_snapshots and recompute from corrected price_cache."""
    session.exec(text("DELETE FROM net_worth_snapshot"))
    session.commit()
    await run_snapshot_backfill(session)
    upsert_live_snapshot(session)


def upsert_live_snapshot(session: Session) -> None:
    """Compute and store a net worth snapshot for today from the latest cached prices.

    Called after every successful price refresh so that the dashboard always
    shows today's date as the 'Last updated' marker.
    """
    today = date_cls.today().isoformat()
    assets = [a for a in crud.list_assets(session) if a.type != "cash"]
    total_eur = 0.0
    for asset in assets:
        units = crud.get_units_held_on_date(session, asset.id, today)
        if units <= 0:
            continue
        price_row = crud.get_price_on_or_before(session, asset.id, today)
        if not price_row:
            continue
        total_eur += units * price_row.price_eur
    invested = crud.get_invested_eur_on_date(session, today)
    crud.upsert_snapshot(session, today, total_eur, invested)
