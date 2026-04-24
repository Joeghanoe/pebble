export interface Lot {
  id: number;
  date: string;
  units: number;
  eurAmount: number;
}

export interface SellTx {
  units: number;
}

export interface FifoResult {
  realizedPnl: number;
  costBasis: number;
}

/**
 * Calculate FIFO cost basis and realized P&L for a sell.
 * Lots should be ordered by date ASC, id ASC (oldest first).
 */
export function calculateFifo(lots: Lot[], sell: SellTx): FifoResult {
  let remainingUnits = sell.units;
  let totalCostBasis = 0;

  // Work through lots oldest first
  const workingLots = lots.map((lot) => ({ ...lot }));

  for (const lot of workingLots) {
    if (remainingUnits <= 0) break;

    const unitsFromLot = Math.min(lot.units, remainingUnits);
    const costPerUnit = lot.eurAmount / lot.units;
    totalCostBasis += unitsFromLot * costPerUnit;
    remainingUnits -= unitsFromLot;
  }

  // If we tried to sell more than we have, cost basis covers what was available
  const realizedPnl = 0; // P&L is relative to sell price, calculated at call site
  return {
    realizedPnl,
    costBasis: totalCostBasis,
  };
}

/**
 * Calculate realized P&L for a sell given a sell EUR amount.
 * Lots ordered by date ASC, id ASC.
 */
export function calculateFifoWithSellAmount(
  lots: Lot[],
  sell: SellTx & { eurAmount: number }
): FifoResult {
  const { costBasis } = calculateFifo(lots, sell);
  const realizedPnl = sell.eurAmount - costBasis;
  return { realizedPnl, costBasis };
}
