import { db } from "../db/runner";
import { setTransactionRealizedPnl } from "../db/queries/transactions";

interface LotRow {
  id: number;
  date: string;
  units: number;
  eur_amount: number;
}

interface SellRow {
  id: number;
  date: string;
  units: number;
  eur_amount: number;
}

/**
 * Recalculate FIFO realized P&L for all sell transactions of an asset.
 * Should be called after any transaction change (add, edit, soft delete).
 */
export function recalculateFifoForAsset(assetId: number): void {
  const buyLots = db
    .query<LotRow, [number]>(
      `SELECT id, date, units, eur_amount FROM transactions
       WHERE asset_id = ? AND type = 'buy' AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);

  const sells = db
    .query<SellRow, [number]>(
      `SELECT id, date, units, eur_amount FROM transactions
       WHERE asset_id = ? AND type = 'sell' AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);

  // Track remaining lot balances across all sells
  const remainingLots = buyLots.map((l) => ({
    id: l.id,
    originalUnits: l.units,
    remaining: l.units,
    costPerUnit: l.eur_amount / l.units,
  }));

  for (const sell of sells) {
    let remainingUnits = sell.units;
    let costBasis = 0;

    for (const lot of remainingLots) {
      if (remainingUnits <= 0) break;
      if (lot.remaining <= 0) continue;

      const unitsFromLot = Math.min(lot.remaining, remainingUnits);
      costBasis += unitsFromLot * lot.costPerUnit;
      lot.remaining -= unitsFromLot;
      remainingUnits -= unitsFromLot;
    }

    const realizedPnl = sell.eur_amount - costBasis;
    setTransactionRealizedPnl(sell.id, realizedPnl);
  }
}
