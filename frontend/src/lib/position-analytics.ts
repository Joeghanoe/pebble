// src/lib/position-analytics.ts
import type { Transaction } from "@/types/db";

export interface EnrichedTransaction extends Transaction {
  currentVal: number | null;
  pct: number | null;
}

export interface PnlChartPoint {
  date: string;
  pnl: number;
}

export function enrichTransactions(
  transactions: Transaction[],
  priceEur: number | null,
): EnrichedTransaction[] {
  return transactions.map((tx) => {
    if (tx.type === "buy" && priceEur !== null) {
      const currentVal = tx.units * priceEur;
      const pct = ((currentVal - tx.eur_amount) / tx.eur_amount) * 100;
      return { ...tx, currentVal, pct };
    }
    return { ...tx, currentVal: null, pct: null };
  });
}

export function getOpenBuyTransactions(
  enrichedTx: EnrichedTransaction[],
  totalSoldUnits: number,
): EnrichedTransaction[] {
  const buyTxs = enrichedTx.filter((t) => t.type === "buy");
  const closedBuyIds = new Set<number>();
  let remainingSold = totalSoldUnits;
  for (const tx of [...buyTxs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (remainingSold <= 0) break;
    if (remainingSold >= tx.units) {
      closedBuyIds.add(tx.id);
      remainingSold -= tx.units;
    } else {
      remainingSold = 0;
    }
  }
  return buyTxs.filter((t) => !closedBuyIds.has(t.id));
}

export function buildPnlChartData(
  openBuyTxs: EnrichedTransaction[],
): PnlChartPoint[] {
  return openBuyTxs.map((t) => ({
    date: t.date,
    pnl: t.pct === null ? 0 : Number.parseFloat(t.pct.toFixed(2)),
  }));
}
