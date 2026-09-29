from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, text
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


def get_exchange(session: Session, exchange_id: int) -> Exchange | None:
    return session.get(Exchange, exchange_id)


def delete_exchange(session: Session, exchange: Exchange) -> None:
    """Delete an exchange. Callers must check `list_assets_by_exchange` first:
    an exchange still referenced by an asset fails the foreign key, and the
    route turns that into a 409 rather than letting it surface as a 500."""
    session.delete(exchange)
    session.commit()


# ============================================================================
# Asset
# ============================================================================


def list_assets(session: Session) -> list[Asset]:
    return list(session.exec(select(Asset).order_by(Asset.symbol)).all())


def list_assets_by_exchange(session: Session, exchange_id: int) -> list[Asset]:
    return list(
        session.exec(
            select(Asset).where(Asset.exchange_id == exchange_id).order_by(Asset.symbol)
        ).all()
    )


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


def delete_asset(session: Session, asset: Asset) -> None:
    """Delete an asset and everything hanging off it, in one transaction.

    Transactions are soft-deleted elsewhere so a mistaken row can come back, but an
    asset carries its whole history: leaving orphaned transactions and cached prices
    behind would keep the position out of `/positions` while still counting towards
    the net-worth snapshots. Nothing references an asset except these three tables.
    """
    asset_id = asset.id
    for table in (Transaction, PriceCache, PositionSnapshot):
        session.exec(delete(table).where(table.asset_id == asset_id))  # type: ignore[call-overload, arg-type]
    session.delete(asset)
    session.commit()


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
            "venue": row.venue,
            "to_venue": row.to_venue,
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
        venue=tx_in.venue,
        to_venue=tx_in.to_venue,
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
    # Whole seconds: microsecond precision is meaningless for a manual delete and pushed
    # the ISO string to 32 characters, over the column's width (see migration 003).
    tx.deleted_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    session.add(tx)
    session.commit()


# ============================================================================
# Venues
# ============================================================================

# Every transaction's effect on the units held at each venue: a buy adds at its
# venue, a sell removes, and a move removes at `venue` and adds at `to_venue`.
# The one definition both per-position holdings and the venue list read from.
_VENUE_DELTAS = """
    SELECT asset_id, venue, CASE type WHEN 'buy' THEN units ELSE -units END AS units
    FROM "transaction" WHERE deleted_at IS NULL
    UNION ALL
    SELECT asset_id, to_venue AS venue, units
    FROM "transaction" WHERE deleted_at IS NULL AND type = 'move'
"""


def get_venue_holdings(session: Session) -> dict[int, list[tuple[str | None, float]]]:
    """Units held per venue for every asset, largest first.

    Venues that net to zero are left out: a wallet emptied by a move is no
    longer somewhere the position is held.
    """
    rows = session.exec(
        text(
            f"""
            SELECT asset_id, venue, SUM(units) AS units
            FROM ({_VENUE_DELTAS}) d
            GROUP BY asset_id, venue
            HAVING ABS(SUM(units)) > 1e-9
            ORDER BY asset_id, SUM(units) DESC
            """
        )
    ).all()
    holdings: dict[int, list[tuple[str | None, float]]] = {}
    for asset_id, venue, units in rows:
        # Rounded well past any displayed precision: 0.12 − 0.05 summed in
        # floating point is 0.06999999999999999, which is noise, not a holding.
        holdings.setdefault(asset_id, []).append((venue, round(float(units), 10)))
    return holdings


def list_venues(session: Session) -> list[tuple[str, int]]:
    """Every venue named on a live transaction, with how many transactions name it."""
    rows = session.exec(
        text(
            """
            SELECT name, COUNT(*) FROM (
              SELECT venue AS name FROM "transaction" WHERE deleted_at IS NULL
              UNION ALL
              SELECT to_venue FROM "transaction" WHERE deleted_at IS NULL
            ) v
            WHERE name IS NOT NULL
            GROUP BY name
            ORDER BY name
            """
        )
    ).all()
    return [(row[0], int(row[1])) for row in rows]


def rename_venue(session: Session, from_name: str, to_name: str) -> int:
    """Renames a venue on every transaction, and returns how many rows changed.

    Renaming onto a name already in use merges the two, which is how a typo is
    folded into the venue it meant.
    """
    changed = 0
    for column in ("venue", "to_venue"):
        result = session.exec(  # type: ignore[call-overload]
            text(
                f'UPDATE "transaction" SET {column} = :to_name WHERE {column} = :from_name'
            ).bindparams(from_name=from_name, to_name=to_name)
        )
        changed += result.rowcount or 0
    session.commit()
    return changed


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


def get_cash_balance_by_date(session: Session, dates: list[str]) -> dict[str, float]:
    """Cash held on each of `dates`, from the ledger alone.

    `net_worth_snapshot.total_eur` counts only assets with a price feed, because
    that is all the snapshot writer can value; `invested_eur` on the same row
    counts every transaction, cash deposits included. Comparing the two directly
    puts the portfolio below its own cost basis by the cash balance, forever.

    Cash needs no feed — a euro is worth a euro — so the missing side is derived
    here at read time rather than stored. That also repairs the rows imported
    from the desktop ledger, which no snapshot rewrite could reach.

    One query for the whole series: a correlated lookup per point would be sixty
    round trips to draw one chart.
    """
    if not dates:
        return {}

    rows = session.exec(
        text(
            """
            SELECT d.date,
                   COALESCE(SUM(
                     CASE t.type WHEN 'buy' THEN t.units WHEN 'sell' THEN -t.units ELSE 0 END
                   ), 0)
            FROM unnest(CAST(:dates AS text[])) AS d(date)
            LEFT JOIN "transaction" t
              ON t.date <= d.date
             AND t.deleted_at IS NULL
             AND t.asset_id IN (SELECT id FROM asset WHERE type = 'cash')
            GROUP BY d.date
            """
        ).bindparams(dates=dates)
    ).all()
    return {row[0]: float(row[1]) for row in rows}


def get_btc_asset(session: Session) -> Asset | None:
    """The one asset that is Bitcoin, by the same rule every BTC feature uses."""
    return session.exec(
        select(Asset)
        .where(func.upper(Asset.symbol) == "BTC")
        .where(Asset.type == "crypto")
        .order_by(Asset.id)  # type: ignore[arg-type]
        .limit(1)
    ).first()


def list_prices_since(session: Session, asset_id: int, since: str) -> list[PriceCache]:
    """Every cached price for an asset on or after `since`, oldest first."""
    return list(
        session.exec(
            select(PriceCache)
            .where(PriceCache.asset_id == asset_id)
            .where(PriceCache.date >= since)
            .order_by(PriceCache.date)  # type: ignore[arg-type]
        ).all()
    )


def get_btc_eur_by_date(session: Session, dates: list[str]) -> dict[str, float]:
    """The BTC price on each of `dates`, for denominating a series in BTC.

    Carried forward from the last price on or before each date, the same rule the
    snapshot writer values a position by — a date the feed skipped is not a date
    bitcoin had no price.

    Empty when the portfolio holds no BTC: without a price there is no BTC view,
    and a fabricated one would be worse than the toggle being unavailable.
    """
    if not dates:
        return {}

    btc = get_btc_asset(session)
    if not btc:
        return {}

    rows = session.exec(
        text(
            """
            SELECT d.date, p.price_eur
            FROM unnest(CAST(:dates AS text[])) AS d(date)
            LEFT JOIN LATERAL (
              SELECT price_eur FROM price_cache
              WHERE asset_id = :asset_id AND date <= d.date
              ORDER BY date DESC LIMIT 1
            ) p ON TRUE
            """
        ).bindparams(dates=dates, asset_id=btc.id)
    ).all()
    return {row[0]: float(row[1]) for row in rows if row[1] is not None}


def list_snapshots_aggregated(session: Session, period: str) -> list[NetWorthSnapshot]:
    """Last 60 points of net worth: daily, or the last snapshot in each week/month.

    `date` is stored as a 'YYYY-MM-DD' string, so lexicographic ordering is already
    chronological and the month bucket is a plain prefix. The week bucket needs a real
    date, hence the cast. This used SQLite's strftime('%Y-%W') before the move to
    Postgres; ISO weeks differ from %W in the first days of January, which shifts at
    most one bucket boundary a year on a chart of the last 60 weeks.
    """
    if period == "1d":
        rows = session.exec(
            text("SELECT date, total_eur, invested_eur FROM net_worth_snapshot ORDER BY date DESC LIMIT 60")
        ).all()
        return [NetWorthSnapshot(date=r[0], total_eur=r[1], invested_eur=r[2]) for r in reversed(rows)]

    bucket = "to_char(date::date, 'IYYY-IW')" if period == "1w" else "substr(date, 1, 7)"
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


def list_position_snapshots_aggregated(
    session: Session, asset_id: int, period: str
) -> list[PositionSnapshot]:
    """`list_snapshots_aggregated`, scoped to one asset.

    Same buckets, same 60-point ceiling, same lexicographic-date assumptions. The
    grouping subquery has to filter by asset before taking MAX(date): without that,
    a bucket whose latest net-worth snapshot predates this asset's would drop out.
    """
    if period == "1d":
        rows = session.exec(
            text(
                "SELECT date, units_held, price_eur, value_eur, invested_eur "
                "FROM position_snapshot WHERE asset_id = :asset_id "
                "ORDER BY date DESC LIMIT 60"
            ).bindparams(asset_id=asset_id)
        ).all()
        rows = list(reversed(rows))
    else:
        bucket = "to_char(date::date, 'IYYY-IW')" if period == "1w" else "substr(date, 1, 7)"
        sql = text(f"""
            SELECT s.date, s.units_held, s.price_eur, s.value_eur, s.invested_eur
            FROM position_snapshot s
            JOIN (
              SELECT MAX(date) AS max_date
              FROM position_snapshot
              WHERE asset_id = :asset_id
              GROUP BY {bucket}
              ORDER BY max_date DESC
              LIMIT 60
            ) g ON s.date = g.max_date
            WHERE s.asset_id = :asset_id
            ORDER BY s.date ASC
        """)
        rows = list(session.exec(sql.bindparams(asset_id=asset_id)).all())

    return [
        PositionSnapshot(
            date=r[0], asset_id=asset_id, units_held=r[1], price_eur=r[2], value_eur=r[3], invested_eur=r[4]
        )
        for r in rows
    ]


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
              SUM(CASE type WHEN 'buy' THEN units WHEN 'sell' THEN -units ELSE 0 END), 0
            ) FROM "transaction"
            WHERE asset_id = :asset_id AND date <= :date AND deleted_at IS NULL
            """
        ).bindparams(asset_id=asset_id, date=date)
    ).one()
    return float(result[0]) if result else 0.0


def get_invested_eur_on_date(session: Session, date: str, asset_id: int | None = None) -> float:
    """Net money put in up to `date` — the whole portfolio, or one asset of it.

    Buys add and sells subtract, so this is cost basis rather than gross spend.
    """
    scope = "" if asset_id is None else "AND asset_id = :asset_id"
    statement = text(
        f"""
        SELECT COALESCE(SUM(CASE type WHEN 'buy' THEN eur_amount WHEN 'sell' THEN -eur_amount ELSE 0 END), 0)
        FROM "transaction" WHERE date <= :date AND deleted_at IS NULL {scope}
        """
    )
    statement = (
        statement.bindparams(date=date)
        if asset_id is None
        else statement.bindparams(date=date, asset_id=asset_id)
    )
    result = session.exec(statement).one()
    return float(result[0]) if result else 0.0


def has_position_snapshots_on_date(session: Session, date: str) -> bool:
    """Whether the per-position rows for a date have been written yet.

    The backfill needs this separately from `get_snapshot`: `net_worth_snapshot`
    was populated by the one-off import from the desktop ledger, but
    `position_snapshot` was not, so a date can carry the portfolio total and none
    of the rows behind it.
    """
    result = session.exec(
        text("SELECT 1 FROM position_snapshot WHERE date = :date LIMIT 1").bindparams(date=date)
    ).first()
    return result is not None
