from datetime import date as date_cls

from sqlmodel import Session

from app import crud
from app.models import (
    Asset,
    Exchange,
    GetPositionsResponse,
    PositionRow,
    PriceResultOk,
    PriceResultStale,
    PriceResultUnavailable,
)


def build_positions(session: Session) -> GetPositionsResponse:
    assets = crud.list_assets(session)
    today = date_cls.today().isoformat()
    latest_rate = crud.get_latest_exchange_rate(session)
    positions: list[PositionRow] = []

    for asset in assets:
        exchange = session.get(Exchange, asset.exchange_id)
        if not exchange:
            continue

        summary = crud.get_transaction_summary(session, asset.id)  # type: ignore[arg-type]
        units_bought = summary["units_bought"]
        units_sold = summary["units_sold"]
        total_invested = summary["total_invested"]
        units_held = units_bought - units_sold

        had_activity = units_bought > 0 or total_invested > 0
        if had_activity and units_held <= 0:
            continue

        realized_pnl = crud.compute_realized_pnl(session, asset.id)  # type: ignore[arg-type]

        if asset.type == "cash":
            price_result: PriceResultOk | PriceResultStale | PriceResultUnavailable = PriceResultOk(
                price_eur=1.0,
                date=today,
                exchange_rate=latest_rate if latest_rate is not None else 0.0,
            )
            current_value_eur = units_held
            pnl_pct = ((current_value_eur - total_invested) / total_invested * 100) if total_invested > 0 else 0.0
            positions.append(PositionRow(
                asset=asset,
                exchange=exchange,
                units_held=units_held,
                total_invested_eur=total_invested,
                current_value_eur=current_value_eur,
                pnl_pct=pnl_pct,
                realized_pnl=realized_pnl,
                price_result=price_result.model_dump(),
            ))
            continue

        latest_price = crud.get_latest_price(session, asset.id)  # type: ignore[arg-type]

        if not latest_price:
            price_result = PriceResultUnavailable()
            current_value_eur = 0.0
        elif latest_price.date == today:
            price_result = PriceResultOk(
                price_eur=latest_price.price_eur,
                date=latest_price.date,
                exchange_rate=latest_price.exchange_rate,
            )
            current_value_eur = units_held * latest_price.price_eur
        else:
            price_result = PriceResultStale(
                price_eur=latest_price.price_eur,
                last_known_date=latest_price.date,
                exchange_rate=latest_price.exchange_rate,
            )
            current_value_eur = units_held * latest_price.price_eur

        pnl_pct = ((current_value_eur - total_invested) / total_invested * 100) if total_invested > 0 else 0.0
        positions.append(PositionRow(
            asset=asset,
            exchange=exchange,
            units_held=units_held,
            total_invested_eur=total_invested,
            current_value_eur=current_value_eur,
            pnl_pct=pnl_pct,
            realized_pnl=realized_pnl,
            price_result=price_result.model_dump(),
        ))

    last_updated = crud.get_max_price_date(session)
    return GetPositionsResponse(positions=positions, last_updated=last_updated)
