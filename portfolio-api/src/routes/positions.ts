import { Elysia } from "elysia";
import { listAssets } from "../db/queries/assets";
import { getExchangeById } from "../db/queries/exchanges";
import { getLatestPrice } from "../db/queries/prices";
import { db } from "../db/runner";
import type { PositionRow } from "../types/api";

interface TxSummaryRow {
  total_invested: number;
  units_bought: number;
  units_sold: number;
  realized_pnl: number;
}

export const positionPlugin = new Elysia({ prefix: "/api/positions" })
  .get("/", () => {
    const assets = listAssets();
    const today = new Date().toISOString().slice(0, 10);
    const positions: PositionRow[] = [];

    for (const asset of assets) {
      const exchange = getExchangeById(asset.exchange_id);
      if (!exchange) continue;

      const summary = db.query<TxSummaryRow, [number]>(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(eur_amount) ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(eur_amount) ELSE 0 END), 0) as total_invested,
           COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(units) ELSE 0 END), 0) as units_bought,
           COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(units) ELSE 0 END), 0) as units_sold,
           COALESCE(SUM(CASE WHEN type = 'sell' THEN COALESCE(realized_pnl, 0) ELSE 0 END), 0) as realized_pnl
         FROM transactions WHERE asset_id = ? AND deleted_at IS NULL`
      ).get(asset.id);

      const unitsBought = summary?.units_bought ?? 0;
      const unitsHeld = unitsBought - (summary?.units_sold ?? 0);
      const totalInvested = summary?.total_invested ?? 0;
      const realizedPnl = summary?.realized_pnl ?? 0;

      const hadActivity = unitsBought > 0 || totalInvested > 0;
      if (hadActivity && unitsHeld <= 0) continue;

      const latestPrice = getLatestPrice(asset.id);
      let priceResult: PositionRow["priceResult"];
      let currentValueEur = 0;

      if (!latestPrice) {
        priceResult = { status: "unavailable" };
      } else if (latestPrice.date === today) {
        priceResult = { status: "ok", priceEur: latestPrice.price_eur, date: latestPrice.date, exchangeRate: latestPrice.exchange_rate };
        currentValueEur = unitsHeld * latestPrice.price_eur;
      } else {
        priceResult = { status: "stale", priceEur: latestPrice.price_eur, lastKnownDate: latestPrice.date, exchangeRate: latestPrice.exchange_rate };
        currentValueEur = unitsHeld * latestPrice.price_eur;
      }

      const pnlPct = totalInvested > 0 ? ((currentValueEur - totalInvested) / totalInvested) * 100 : 0;

      positions.push({ asset, exchange, unitsHeld, totalInvestedEur: totalInvested, currentValueEur, pnlPct, realizedPnl, priceResult });
    }

    const lastUpdatedRow = db.query<{ date: string }, []>("SELECT MAX(date) as date FROM price_cache").get();
    return { positions, lastUpdated: lastUpdatedRow?.date ?? null };
  });
