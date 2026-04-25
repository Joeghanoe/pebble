// src/lib/position-analytics.ts
import type { Transaction } from "@/types/db";

export interface EnrichedTransaction extends Transaction {
  currentVal: number | null;
  pct: number | null;
}

export interface PositionTotals {
  totalUnits: number;
  totalPaid: number;
  totalCurrentVal: number | null;
  totalPct: number | null;
}

export interface PnlChartPoint {
  date: string;
  pnl: number;
}

export interface ValueChartPoint {
  date: string;
  value: number;
}

export interface FrequencyPoint {
  index: number;
  date: string;
  timestamp: number;
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

export function buildValueChartData(
  openBuyTxs: EnrichedTransaction[],
): ValueChartPoint[] {
  return openBuyTxs.map((t) => ({
    date: t.date,
    value:
      t.currentVal === null ? 0 : Number.parseFloat(t.currentVal.toFixed(2)),
  }));
}

export function buildFrequencyData(
  buyTxs: EnrichedTransaction[],
): FrequencyPoint[] {
  return buyTxs.map((t, i) => ({
    index: i + 1,
    date: t.date,
    timestamp: new Date(t.date).getTime(),
  }));
}

export function calcPositionTotals(
  transactions: Transaction[],
  priceEur: number | null,
): PositionTotals {
  const totalUnits = transactions.reduce(
    (s, t) => (t.type === "buy" ? s + t.units : s - t.units),
    0,
  );
  const totalPaid = transactions.reduce(
    (s, t) => (t.type === "buy" ? s + t.eur_amount : s - t.eur_amount),
    0,
  );
  const totalCurrentVal = priceEur === null ? null : totalUnits * priceEur;
  const totalPct =
    totalPaid > 0 && totalCurrentVal !== null
      ? ((totalCurrentVal - totalPaid) / totalPaid) * 100
      : null;
  return { totalUnits, totalPaid, totalCurrentVal, totalPct };
}
