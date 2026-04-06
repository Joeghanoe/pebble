import { listAssets } from "../db/queries/assets";
import { getExchangeById } from "../db/queries/exchanges";
import { getLatestExchangeRate, getLatestPrice } from "../db/queries/prices";
import { getTransactionSummaryByAsset } from "../db/queries/transactions";
import { db } from "../db/runner";
import type { PositionRow } from "../types/api";

export function buildPositions(): { positions: PositionRow[]; lastUpdated: string | null } {
  const assets = listAssets();
  const today = new Date().toISOString().slice(0, 10);
  const latestExchangeRate = getLatestExchangeRate();
  const positions: PositionRow[] = [];

  for (const asset of assets) {
    const exchange = getExchangeById(asset.exchange_id);
    if (!exchange) continue;

    const summary = getTransactionSummaryByAsset(asset.id);
    const { unitsBought, unitsSold, totalInvested, realizedPnl } = summary;
    const unitsHeld = unitsBought - unitsSold;

    const hadActivity = unitsBought > 0 || totalInvested > 0;
    if (hadActivity && unitsHeld <= 0) continue;

    let priceResult: PositionRow["priceResult"];
    let currentValueEur = 0;

    // Cash positions are denominated in EUR in this app, so value is 1 EUR per unit.
    if (asset.type === "cash") {
      priceResult = {
        status: "ok",
        priceEur: 1,
        date: today,
        // Use latest known EUR->USD rate when available; 0 means "unknown" for UI rendering.
        exchangeRate: latestExchangeRate ?? 0,
      };
      currentValueEur = unitsHeld;
      const pnlPct = totalInvested > 0 ? ((currentValueEur - totalInvested) / totalInvested) * 100 : 0;
      positions.push({ asset, exchange, unitsHeld, totalInvestedEur: totalInvested, currentValueEur, pnlPct, realizedPnl, priceResult });
      continue;
    }

    const latestPrice = getLatestPrice(asset.id);

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
}
