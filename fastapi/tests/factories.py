"""Building holdings and prices the way the app does, for tests that seed the DB directly.

A holding is an `asset` row pointing at an `instrument` (migration 009), and prices
are cached per instrument, so these go through the same find-or-create the API uses
rather than each test assembling rows by hand.
"""

from sqlmodel import Session

from app import crud
from app.models import Asset, AssetCreate, PriceCache


def make_asset(
    session: Session,
    symbol: str = "BTC",
    *,
    type: str = "crypto",  # noqa: A002
    exchange_id: int = 1,
    coingecko_id: str | None = None,
    yahoo_ticker: str | None = None,
    name: str | None = None,
) -> int:
    asset = crud.create_asset(
        session,
        AssetCreate(
            symbol=symbol, name=name or symbol, type=type, exchange_id=exchange_id,  # type: ignore[arg-type]
            coingecko_id=coingecko_id, yahoo_ticker=yahoo_ticker,
        ),
    )
    return asset.id


def cache_price(
    session: Session, asset_id: int, date: str, price: float, rate: float = 1.1
) -> None:
    """Adds a cached price for the holding's instrument. Not committed, like `session.add`."""
    instrument_id = session.get(Asset, asset_id).instrument_id  # type: ignore[union-attr]
    session.add(
        PriceCache(instrument_id=instrument_id, date=date, price_eur=price, exchange_rate=rate)
    )
