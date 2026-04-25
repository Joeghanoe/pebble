from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlmodel import Session, select

from app.models import (
    Asset,
    AssetCreate,
    AssetUpdate,
    Exchange,
    ExchangeCreate,
    NetWorthSnapshot,
    PriceCache,
    PositionSnapshot,
    Transaction,
    TransactionCreate,
    TransactionUpdate,
)


# ============================================================================
# Exchange
# ============================================================================


def list_exchanges(session: Session) -> list[Exchange]:
    return list(session.exec(select(Exchange)).all())


def create_exchange(session: Session, exchange_in: ExchangeCreate) -> Exchange:
    exchange = Exchange.model_validate(exchange_in)
    session.add(exchange)
    session.commit()
    session.refresh(exchange)
    return exchange


def delete_exchange(session: Session, exchange_id: int) -> None:
    exchange = session.get(Exchange, exchange_id)
    if exchange:
        session.delete(exchange)
        session.commit()


# ============================================================================
# Asset
# ============================================================================


def list_assets(session: Session) -> list[Asset]:
    return list(session.exec(select(Asset).order_by(Asset.symbol)).all())


def get_asset(session: Session, asset_id: int) -> Asset | None:
    return session.get(Asset, asset_id)


def create_asset(session: Session, asset_in: AssetCreate) -> Asset:
    asset = Asset.model_validate(asset_in)
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


def update_asset(session: Session, asset: Asset, asset_in: AssetUpdate) -> Asset:
    data = asset_in.model_dump(exclude_unset=True)
    asset.sqlmodel_update(data)
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


# ============================================================================
# Transaction
# ============================================================================


def list_transactions_by_asset(session: Session, asset_id: int) -> list[dict[str, Any]]:
    """Return transactions with computed realized_pnl for sells via FIFO."""
    rows = session.exec(
        select(Transaction)
        .where(Transaction.asset_id == asset_id)
        .where(Transaction.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(Transaction.date, Transaction.id)  # type: ignore[arg-type]
    ).all()

    buy_lots = get_buy_lots_for_asset(session, asset_id)
    working_lots = [{"remaining": lot["units"], "cost_per_unit": lot["eur_amount"] / lot["units"]} for lot in buy_lots]

    result = []
    for row in rows:
        realized_pnl = None
        if row.type == "sell":
            remaining = row.units
            cost_basis = 0.0
            for lot in working_lots:
                if remaining <= 0:
                    break
                if lot["remaining"] <= 0:
                    continue
                used = min(lot["remaining"], remaining)
                cost_basis += used * lot["cost_per_unit"]
                lot["remaining"] -= used
                remaining -= used
            realized_pnl = row.eur_amount - cost_basis

        result.append({
            "id": row.id,
            "asset_id": row.asset_id,
            "date": row.date,
            "type": row.type,
            "units": row.units,
            "eur_amount": row.eur_amount,
            "realized_pnl": realized_pnl,
            "notes": row.notes,
            "source": row.source,
            "external_id": row.external_id,
            "deleted_at": row.deleted_at,
        })
    return result


def get_transaction(session: Session, tx_id: int) -> Transaction | None:
    return session.get(Transaction, tx_id)


def create_transaction(session: Session, tx_in: TransactionCreate) -> Transaction:
    tx = Transaction(
        asset_id=tx_in.asset_id,
        date=tx_in.date,
        type=tx_in.type,
        units=abs(tx_in.units),
        eur_amount=abs(tx_in.eur_amount),
        notes=tx_in.notes,
    )
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return tx


def update_transaction(session: Session, tx: Transaction, tx_in: TransactionUpdate) -> Transaction:
    data = tx_in.model_dump(exclude_unset=True)
    if "units" in data and data["units"] is not None:
        data["units"] = abs(data["units"])
    if "eur_amount" in data and data["eur_amount"] is not None:
        data["eur_amount"] = abs(data["eur_amount"])
    tx.sqlmodel_update(data)
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return tx


def soft_delete_transaction(session: Session, tx: Transaction) -> None:
    tx.deleted_at = datetime.now(timezone.utc).isoformat()
    session.add(tx)
    session.commit()


def get_buy_lots_for_asset(session: Session, asset_id: int) -> list[dict[str, Any]]:
    rows = session.exec(
        select(Transaction)
        .where(Transaction.asset_id == asset_id)
        .where(Transaction.type == "buy")
        .where(Transaction.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(Transaction.date, Transaction.id)  # type: ignore[arg-type]
    ).all()
    return [{"id": r.id, "date": r.date, "units": r.units, "eur_amount": r.eur_amount} for r in rows]


def get_transaction_summary(session: Session, asset_id: int) -> dict[str, float]:
    result = session.exec(
        text(
            """
            SELECT
              COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(eur_amount) ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(eur_amount) ELSE 0 END), 0) AS total_invested,
              COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(units) ELSE 0 END), 0) AS units_bought,
              COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(units) ELSE 0 END), 0) AS units_sold
            FROM "transaction"
            WHERE asset_id = :asset_id AND deleted_at IS NULL
            """
        ).bindparams(asset_id=asset_id)
    ).one()
    return {
        "total_invested": float(result[0]),
        "units_bought": float(result[1]),
        "units_sold": float(result[2]),
    }


def compute_realized_pnl(session: Session, asset_id: int) -> float:
    lots = get_buy_lots_for_asset(session, asset_id)
    working = [{"remaining": lot["units"], "cost_per_unit": lot["eur_amount"] / lot["units"]} for lot in lots]

    sells = session.exec(
        select(Transaction)
        .where(Transaction.asset_id == asset_id)
        .where(Transaction.type == "sell")
        .where(Transaction.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(Transaction.date, Transaction.id)  # type: ignore[arg-type]
    ).all()

    total = 0.0
    for sell in sells:
        remaining = sell.units
        cost_basis = 0.0
        for lot in working:
            if remaining <= 0:
                break
            if lot["remaining"] <= 0:
                continue
            used = min(lot["remaining"], remaining)
            cost_basis += used * lot["cost_per_unit"]
            lot["remaining"] -= used
            remaining -= used
        total += sell.eur_amount - cost_basis
    return total


# ============================================================================
# Price Cache
# ============================================================================


def get_latest_price(session: Session, asset_id: int) -> PriceCache | None:
    return session.exec(
        select(PriceCache)
        .where(PriceCache.asset_id == asset_id)
        .order_by(PriceCache.date.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()


def get_latest_exchange_rate(session: Session) -> float | None:
    row = session.exec(
        select(PriceCache).order_by(PriceCache.date.desc()).limit(1)  # type: ignore[arg-type]
    ).first()
    return row.exchange_rate if row else None


def get_price_on_or_before(session: Session, asset_id: int, date: str) -> PriceCache | None:
    return session.exec(
        select(PriceCache)
        .where(PriceCache.asset_id == asset_id)
        .where(PriceCache.date <= date)
        .order_by(PriceCache.date.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()


def upsert_price(session: Session, asset_id: int, date: str, price_eur: float, exchange_rate: float) -> None:
    existing = session.exec(
        select(PriceCache)
        .where(PriceCache.asset_id == asset_id)
        .where(PriceCache.date == date)
    ).first()
    if existing:
        existing.price_eur = price_eur
        existing.exchange_rate = exchange_rate
        session.add(existing)
    else:
        session.add(PriceCache(asset_id=asset_id, date=date, price_eur=price_eur, exchange_rate=exchange_rate))
    session.commit()


def get_max_price_date(session: Session) -> str | None:
    result = session.exec(text("SELECT MAX(date) FROM price_cache")).one()
    return result[0] if result else None


# ============================================================================
# Net Worth Snapshots
# ============================================================================


def list_snapshots_aggregated(session: Session, period: str) -> list[NetWorthSnapshot]:
    if period == "1d":
        rows = session.exec(
            text("SELECT date, total_eur, invested_eur FROM net_worth_snapshot ORDER BY date DESC LIMIT 60")
        ).all()
        return [NetWorthSnapshot(date=r[0], total_eur=r[1], invested_eur=r[2]) for r in reversed(rows)]

    bucket = "strftime('%Y-%W', date)" if period == "1w" else "strftime('%Y-%m', date)"
    sql = text(f"""
        SELECT s.date, s.total_eur, s.invested_eur
        FROM net_worth_snapshot s
        JOIN (
          SELECT MAX(date) AS max_date
          FROM net_worth_snapshot
          GROUP BY {bucket}
          ORDER BY max_date DESC
          LIMIT 60
        ) g ON s.date = g.max_date
        ORDER BY s.date ASC
    """)
    rows = session.exec(sql).all()
    return [NetWorthSnapshot(date=r[0], total_eur=r[1], invested_eur=r[2]) for r in rows]


def get_snapshot(session: Session, date: str) -> NetWorthSnapshot | None:
    return session.get(NetWorthSnapshot, date)


def upsert_snapshot(session: Session, date: str, total_eur: float, invested_eur: float) -> None:
    existing = session.get(NetWorthSnapshot, date)
    if existing:
        existing.total_eur = total_eur
        existing.invested_eur = invested_eur
        session.add(existing)
    else:
        session.add(NetWorthSnapshot(date=date, total_eur=total_eur, invested_eur=invested_eur))
    session.commit()


def upsert_position_snapshot(
    session: Session,
    date: str,
    asset_id: int,
    units_held: float,
    price_eur: float,
    value_eur: float,
    invested_eur: float,
) -> None:
    existing = session.exec(
        select(PositionSnapshot)
        .where(PositionSnapshot.date == date)
        .where(PositionSnapshot.asset_id == asset_id)
    ).first()
    if existing:
        existing.units_held = units_held
        existing.price_eur = price_eur
        existing.value_eur = value_eur
        existing.invested_eur = invested_eur
        session.add(existing)
    else:
        session.add(PositionSnapshot(
            date=date, asset_id=asset_id, units_held=units_held,
            price_eur=price_eur, value_eur=value_eur, invested_eur=invested_eur,
        ))
    session.commit()


def get_earliest_transaction_date(session: Session) -> str | None:
    result = session.exec(
        text("SELECT MIN(date) FROM \"transaction\" WHERE deleted_at IS NULL")
    ).one()
    return result[0] if result else None


def get_units_held_on_date(session: Session, asset_id: int, date: str) -> float:
    result = session.exec(
        text(
            """
            SELECT COALESCE(
              SUM(CASE WHEN type = 'buy' THEN units ELSE -units END), 0
            ) FROM "transaction"
            WHERE asset_id = :asset_id AND date <= :date AND deleted_at IS NULL
            """
        ).bindparams(asset_id=asset_id, date=date)
    ).one()
    return float(result[0]) if result else 0.0


def get_invested_eur_on_date(session: Session, date: str) -> float:
    result = session.exec(
        text(
            """
            SELECT COALESCE(SUM(CASE WHEN type = 'buy' THEN eur_amount ELSE -eur_amount END), 0)
            FROM "transaction" WHERE date <= :date AND deleted_at IS NULL
            """
        ).bindparams(date=date)
    ).one()
    return float(result[0]) if result else 0.0
