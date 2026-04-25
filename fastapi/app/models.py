from typing import Any, Literal, Optional, Union

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
    deleted_at: Optional[str] = Field(default=None, max_length=30)


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


class AssetCreate(SQLModel):
    symbol: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    type: str  # crypto | etf | cash | stock
    exchange_id: int
    yahoo_ticker: Optional[str] = None
    coingecko_id: Optional[str] = None


class AssetUpdate(SQLModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    exchange_id: Optional[int] = None
    yahoo_ticker: Optional[str] = None
    coingecko_id: Optional[str] = None


class ExchangeCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    type: str  # crypto | broker | manual


class TransactionCreate(SQLModel):
    asset_id: int
    date: str
    type: str  # buy | sell
    units: float
    eur_amount: float
    notes: Optional[str] = None


class TransactionUpdate(SQLModel):
    date: Optional[str] = None
    type: Optional[str] = None
    units: Optional[float] = None
    eur_amount: Optional[float] = None
    notes: Optional[str] = None


class SecretSet(SQLModel):
    value: str


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


class GetNetWorthResponse(SQLModel):
    snapshots: list[SnapshotRow]


class Message(SQLModel):
    message: str
