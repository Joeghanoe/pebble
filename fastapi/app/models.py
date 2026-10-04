from typing import Annotated, Any, Literal, Optional, Union

import sqlalchemy as sa
from pydantic import StringConstraints
from sqlmodel import Field, SQLModel

from app.core.types import IsoDate as IsoDateColumn
from app.core.types import IsoTimestamp

# Money, units and rates are numeric(28, 10) in Postgres (migration 005): exact storage
# and exact SQL sums. asdecimal=False keeps them floats in Python, where the FIFO and
# valuation arithmetic lives; see app/core/db.py for the same rule on raw SQL.
Amount = sa.Numeric(28, 10, asdecimal=False)


# ============================================================================
# Database Table Models
# ============================================================================


class Exchange(SQLModel, table=True):
    __tablename__ = "exchange"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    type: str = Field(max_length=20)  # crypto | broker | manual


class Instrument(SQLModel, table=True):
    """What is held and where its price comes from. Global: no owner (migration 007).

    Holdings that name the same feed share one instrument, so a price is fetched
    and cached once however many positions -- and later, portfolios -- hold it.
    """

    __tablename__ = "instrument"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    type: str = Field(max_length=20)  # crypto | etf | cash | stock
    symbol: str = Field(max_length=50)
    name: str = Field(max_length=255)
    yahoo_ticker: Optional[str] = Field(default=None, max_length=50)
    coingecko_id: Optional[str] = Field(default=None, max_length=100)


class Asset(SQLModel, table=True):
    """A holding: one instrument, on one exchange, under the label its owner gave it."""

    __tablename__ = "asset"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(max_length=50)
    name: str = Field(max_length=255)
    exchange_id: int = Field(foreign_key="exchange.id")
    instrument_id: int = Field(foreign_key="instrument.id")


class Transaction(SQLModel, table=True):
    __tablename__ = "transaction"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id")
    date: str = Field(sa_type=IsoDateColumn)  # a `date`, read as YYYY-MM-DD
    type: str = Field(max_length=10)  # buy | sell
    units: float = Field(sa_type=Amount)
    eur_amount: float = Field(sa_type=Amount)
    notes: Optional[str] = Field(default=None)
    source: str = Field(default="manual", max_length=20)  # manual | imported
    external_id: Optional[str] = Field(default=None)
    # A timestamptz, read as ISO 8601 in UTC (migration 006).
    deleted_at: Optional[str] = Field(default=None, sa_type=IsoTimestamp)


class PriceCache(SQLModel, table=True):
    __tablename__ = "price_cache"  # type: ignore[assignment]

    instrument_id: int = Field(foreign_key="instrument.id", primary_key=True)
    date: str = Field(primary_key=True, sa_type=IsoDateColumn)
    price_eur: float = Field(sa_type=Amount)
    exchange_rate: float = Field(sa_type=Amount)


class NetWorthSnapshot(SQLModel, table=True):
    __tablename__ = "net_worth_snapshot"  # type: ignore[assignment]

    date: str = Field(primary_key=True, sa_type=IsoDateColumn)
    total_eur: float = Field(sa_type=Amount)
    invested_eur: float = Field(default=0.0, sa_type=Amount)


class PositionSnapshot(SQLModel, table=True):
    __tablename__ = "position_snapshot"  # type: ignore[assignment]

    date: str = Field(primary_key=True, sa_type=IsoDateColumn)
    asset_id: int = Field(foreign_key="asset.id", primary_key=True)
    units_held: float = Field(sa_type=Amount)
    price_eur: float = Field(sa_type=Amount)
    value_eur: float = Field(sa_type=Amount)
    invested_eur: float = Field(sa_type=Amount)


# ============================================================================
# API Request Models
# ============================================================================

# These were plain `str` with the allowed values in a comment. Postgres enforces the
# declared column widths that SQLite ignored, so an over-long value now fails the
# INSERT and surfaces as a 500; spelling the sets out turns that into a 422 and makes
# the generated TypeScript client a union instead of `string`.
AssetType = Literal["crypto", "etf", "cash", "stock"]
ExchangeType = Literal["crypto", "broker", "manual"]
TransactionType = Literal["buy", "sell"]

# 'YYYY-MM-DD'. The column is 10 characters wide and every comparison in the raw SQL
# relies on ISO dates sorting lexicographically, so a free-form string is not safe here.
IsoDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class AssetCreate(SQLModel):
    symbol: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    type: AssetType
    exchange_id: int
    yahoo_ticker: Optional[str] = Field(default=None, max_length=50)
    coingecko_id: Optional[str] = Field(default=None, max_length=100)


class AssetUpdate(SQLModel):
    symbol: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    type: Optional[AssetType] = None
    exchange_id: Optional[int] = None
    yahoo_ticker: Optional[str] = Field(default=None, max_length=50)
    coingecko_id: Optional[str] = Field(default=None, max_length=100)


class ExchangeCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    type: ExchangeType


class TransactionCreate(SQLModel):
    asset_id: int
    date: IsoDate
    type: TransactionType
    units: float
    eur_amount: float
    notes: Optional[str] = None


class TransactionUpdate(SQLModel):
    date: Optional[IsoDate] = None
    type: Optional[TransactionType] = None
    units: Optional[float] = None
    eur_amount: Optional[float] = None
    notes: Optional[str] = None


# ============================================================================
# API Response Models
# ============================================================================


class AssetPublic(SQLModel):
    """A holding as the API presents it: its label plus its instrument, flattened.

    The shape `asset` had before migration 007 split the instrument out, plus
    `instrument_id`, so the client did not have to change. It is also what the price,
    snapshot and position services take: everything they need in one object.
    """

    id: int
    symbol: str
    name: str
    type: str
    exchange_id: int
    yahoo_ticker: Optional[str] = None
    coingecko_id: Optional[str] = None
    instrument_id: int


class PriceResultOk(SQLModel):
    status: Literal["ok"] = "ok"
    price_eur: float
    date: str
    exchange_rate: float


class PriceResultStale(SQLModel):
    status: Literal["stale"] = "stale"
    price_eur: float
    last_known_date: str
    exchange_rate: float


class PriceResultUnavailable(SQLModel):
    status: Literal["unavailable"] = "unavailable"


PriceResult = Union[PriceResultOk, PriceResultStale, PriceResultUnavailable]


class PositionRow(SQLModel):
    asset: AssetPublic
    exchange: Exchange
    units_held: float
    total_invested_eur: float
    current_value_eur: float
    pnl_pct: float
    realized_pnl: float
    price_result: Any


class GetPositionsResponse(SQLModel):
    positions: list[PositionRow]
    last_updated: Optional[str] = None


class RefreshResultItem(SQLModel):
    asset_id: int
    symbol: str
    result: Any


class RefreshPricesResponse(SQLModel):
    throttled: bool
    reason: Optional[str] = None  # cooldown | in_progress
    next_allowed_at: Optional[str] = None
    results: list[RefreshResultItem]


class SnapshotRow(SQLModel):
    date: str
    total_eur: float
    invested_eur: float
    # The BTC price that day, so the client can denominate the series in BTC.
    # None when nothing priced BTC on or before that date, which is a point the
    # BTC view has to leave out rather than guess at.
    btc_eur: float | None = None


class GetNetWorthResponse(SQLModel):
    snapshots: list[SnapshotRow]


class PositionHistoryPoint(SQLModel):
    date: str
    units_held: float
    price_eur: float
    value_eur: float
    invested_eur: float


class GetPositionHistoryResponse(SQLModel):
    points: list[PositionHistoryPoint]


class BtcDailyClose(SQLModel):
    date: str
    price_eur: float


class GetBtcDailyResponse(SQLModel):
    closes: list[BtcDailyClose]


class Message(SQLModel):
    message: str
