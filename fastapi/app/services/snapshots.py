import calendar
from datetime import date as date_cls
from datetime import timedelta

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


# How far back the daily series is kept gap-free. The charts that ask for daily
# points cover a week and a month, and `list_snapshots_aggregated` returns sixty
# of them; ninety days covers both with room to spare, and bounds the backfill to
# one bounded range request per asset.
DAILY_WINDOW_DAYS = 90


def _dates_between(start: date_cls, end: date_cls) -> list[str]:
    span = (end - start).days
    return [(start + timedelta(days=offset)).isoformat() for offset in range(span + 1)]


# How far a price may be carried forward to value a day that has none of its own.
# Long enough for a weekend plus a holiday on either side, which is a market that
# was shut rather than a price nobody fetched; short enough that a gap the feeds
# could not fill stays visibly empty instead of becoming a flat line.
CARRY_FORWARD_DAYS = 5


def _is_fully_priced(session: Session, assets: list, date_str: str) -> bool:
    """Whether every asset held on `date_str` has a price close enough to value it.

    A snapshot missing one position is not a smaller portfolio, it is a wrong
    one, and it would draw a cliff on the chart. The month-end backfill already
    refuses to write those; the daily fill holds the same line, and additionally
    refuses to stretch one stale price across weeks of days it never covered.
    """
    target = date_cls.fromisoformat(date_str)
    for asset in assets:
        if crud.get_units_held_on_date(session, asset.id, date_str) <= 0:
            continue
        price_row = crud.get_price_on_or_before(session, asset.id, date_str)
        if not price_row:
            return False
        if (target - date_cls.fromisoformat(price_row.date)).days > CARRY_FORWARD_DAYS:
            return False
    return True


async def run_daily_gap_fill(session: Session, window_days: int = DAILY_WINDOW_DAYS) -> int:
    """Writes a snapshot for every recent day that has none, and returns the count.

    A snapshot is only recorded when a price refresh runs, and a refresh only
    runs when the app is open — so a week nobody looked leaves a week-shaped hole
    in the daily chart, and the line jumps straight from one visit to the next.

    Filling those days needs a price per asset per day, which `fetch_historical_price`
    would buy one request at a time. Each source here serves a date range in a
    single call instead, so a ninety-day window costs one request per asset
    rather than ninety.

    Days the sources cannot cover are skipped, not guessed at: weekends and
    holidays carry the last close forward, as the snapshot writer already does,
    but a day where a held asset has no price at all gets no row.
    """
    earliest = crud.get_earliest_transaction_date(session)
    if not earliest:
        return 0

    assets = _priced_assets(session)
    if not assets:
        return 0

    today = date_cls.today()
    start = max(today - timedelta(days=window_days), date_cls.fromisoformat(earliest))
    if start > today:
        return 0

    missing = [
        date_str
        for date_str in _dates_between(start, today)
        if crud.get_snapshot(session, date_str) is None
    ]
    if not missing:
        return 0

    price_service = get_price_service()
    for asset in assets:
        await price_service.backfill_price_range(session, asset, missing[0], missing[-1])

    written = 0
    for date_str in missing:
        if not _is_fully_priced(session, assets, date_str):
            continue
        record_snapshot_for_date(session, date_str)
        written += 1
    return written


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
