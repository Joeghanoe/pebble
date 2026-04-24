import { db } from "../db/runner";
import { getBuyLotsForAsset } from "../db/queries/transactions";

interface SellRow {
  id: number;
  date: string;
  units: number;
  eur_amount: number;
}

export function computeRealizedPnlForAsset(assetId: number): number {
  const lots = getBuyLotsForAsset(assetId).map((l) => ({
    remaining: l.units,
    costPerUnit: l.eur_amount / l.units,
  }));

  const sells = db
    .query<SellRow, [number]>(
      `SELECT id, date, units, eur_amount FROM transactions
       WHERE asset_id = ? AND type = 'sell' AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);

  let totalRealizedPnl = 0;
  for (const sell of sells) {
    let remaining = sell.units;
    let costBasis = 0;
    for (const lot of lots) {
      if (remaining <= 0) break;
      if (lot.remaining <= 0) continue;
      const used = Math.min(lot.remaining, remaining);
      costBasis += used * lot.costPerUnit;
      lot.remaining -= used;
      remaining -= used;
    }
    totalRealizedPnl += sell.eur_amount - costBasis;
  }

  return totalRealizedPnl;
}
