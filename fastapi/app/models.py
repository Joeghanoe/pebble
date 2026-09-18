from typing import Annotated, Any, Literal, Optional, Union

from pydantic import StringConstraints
from sqlmodel import Field, SQLModel


# ============================================================================
# Database Table Models
# ============================================================================


class Exchange(SQLModel, table=True):
    __tablename__ = "exchange"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    type: str = Field(max_length=20)  # crypto | broker | manual


class Asset(SQLModel, table=True):
    __tablename__ = "asset"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(max_length=50)
    name: str = Field(max_length=255)
    type: str = Field(max_length=20)  # crypto | etf | cash | stock
    exchange_id: int = Field(foreign_key="exchange.id")
    yahoo_ticker: Optional[str] = Field(default=None, max_length=50)
    coingecko_id: Optional[str] = Field(default=None, max_length=100)


class Transaction(SQLModel, table=True):
    __tablename__ = "transaction"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id")
    date: str = Field(max_length=10)  # YYYY-MM-DD
    type: str = Field(max_length=10)  # buy | sell
    units: float
    eur_amount: float
    notes: Optional[str] = Field(default=None)
    source: str = Field(default="manual", max_length=20)  # manual | imported
    external_id: Optional[str] = Field(default=None)
    # ISO 8601 UTC, whole seconds. 40 rather than 30: see migration 003.
    deleted_at: Optional[str] = Field(default=None, max_length=40)


class PriceCache(SQLModel, table=True):
    __tablename__ = "price_cache"  # type: ignore[assignment]

    asset_id: int = Field(foreign_key="asset.id", primary_key=True)
    date: str = Field(primary_key=True, max_length=10)
    price_eur: float
    exchange_rate: float


class NetWorthSnapshot(SQLModel, table=True):
    __tablename__ = "net_worth_snapshot"  # type: ignore[assignment]

    date: str = Field(primary_key=True, max_length=10)
    total_eur: float
    invested_eur: float = Field(default=0.0)


class PositionSnapshot(SQLModel, table=True):
    __tablename__ = "position_snapshot"  # type: ignore[assignment]

    date: str = Field(primary_key=True, max_length=10)
    asset_id: int = Field(foreign_key="asset.id", primary_key=True)
    units_held: float
    price_eur: float
    value_eur: float
    invested_eur: float


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
    asset: Asset
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


class Message(SQLModel):
    message: str
