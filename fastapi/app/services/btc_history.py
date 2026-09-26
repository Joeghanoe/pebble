from datetime import date as date_cls
from datetime import timedelta

from sqlmodel import Session

from app import crud
from app.services.price_service_factory import get_price_service

# How much daily BTC history the strategy view keeps. Its regime rule needs 230
# consecutive closes (a 200-day average, then 30 days on one side of it), and
# CoinGecko's keyless API serves nothing older than 365 days — so a year is both
# enough and the most that can be asked for.
BTC_HISTORY_DAYS = 365


def btc_history_start(today: date_cls) -> str:
    """The first date of the window, inclusive, so the window is exactly a year."""
    return (today - timedelta(days=BTC_HISTORY_DAYS - 1)).isoformat()


async def ensure_btc_daily_history(session: Session) -> int:
    """Fills every missing day of BTC close in the last year, and returns the count.

    The daily gap fill only keeps ninety days gap-free, and before that the cache
    holds month ends — nowhere near a 200-day average. This closes the rest of the
    year in one ranged request, and only when a day is actually missing, so once
    the year is full it costs nothing.

    A portfolio without BTC has no BTC asset to cache prices against, so there is
    nothing to fill; the strategy view reports that as insufficient data.
    """
    btc = crud.get_btc_asset(session)
    if not btc or not btc.coingecko_id:
        return 0

    today = date_cls.today()
    start = btc_history_start(today)
    have = {p.date for p in crud.list_prices_since(session, btc.id, start)}  # type: ignore[arg-type]
    # Today is left out: its close does not exist yet, and the live quote already
    # writes today's row on every refresh.
    missing = [
        (today - timedelta(days=offset)).isoformat()
        for offset in range(1, BTC_HISTORY_DAYS)
        if (today - timedelta(days=offset)).isoformat() not in have
    ]
    if not missing:
        return 0

    return await get_price_service().backfill_price_range(
        session, btc, min(missing), max(missing)
    )
