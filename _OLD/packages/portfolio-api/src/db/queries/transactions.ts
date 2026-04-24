import { db } from "../runner";
import type { Transaction } from "../../types/db";

type TransactionRow = Omit<Transaction, "realized_pnl">;

export function listTransactionsByAsset(assetId: number): Transaction[] {
  const rows = db
    .query<TransactionRow, [number]>(
      `SELECT id, asset_id, date, type, units, eur_amount, notes, source, external_id, deleted_at
       FROM transactions
       WHERE asset_id = ? AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);

  // Compute realized P&L for sell transactions via FIFO on every read.
  // buy lots are consumed in chronological order across all sells.
  const lots = getBuyLotsForAsset(assetId).map((l) => ({
    remaining: l.units,
    costPerUnit: l.eur_amount / l.units,
  }));

  const pnlMap = new Map<number, number>();
  for (const row of rows) {
    if (row.type !== "sell") continue;
    let remaining = row.units;
    let costBasis = 0;
    for (const lot of lots) {
      if (remaining <= 0) break;
      if (lot.remaining <= 0) continue;
      const used = Math.min(lot.remaining, remaining);
      costBasis += used * lot.costPerUnit;
      lot.remaining -= used;
      remaining -= used;
    }
    pnlMap.set(row.id, row.eur_amount - costBasis);
  }

  return rows.map((row) => ({
    ...row,
    realized_pnl: row.type === "sell" ? (pnlMap.get(row.id) ?? null) : null,
  }));
}

export function getTransactionById(id: number): Transaction | null {
  const row = db
    .query<TransactionRow, [number]>(
      `SELECT id, asset_id, date, type, units, eur_amount, notes, source, external_id, deleted_at
       FROM transactions WHERE id = ?`
    )
    .get(id);
  if (!row) return null;
  return { ...row, realized_pnl: null };
}

export function createTransaction(
  assetId: number,
  date: string,
  type: "buy" | "sell",
  units: number,
  eurAmount: number,
  notes: string | null = null,
  source: "manual" | "imported" = "manual",
  externalId: string | null = null
): Transaction {
  const result = db
    .query<{ id: number }, [number, string, string, number, number, string | null, string, string | null]>(
      `INSERT INTO transactions (asset_id, date, type, units, eur_amount, notes, source, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(assetId, date, type, units, eurAmount, notes, source, externalId);
  if (!result) throw new Error("Failed to create transaction");
  return {
    id: result.id,
    asset_id: assetId,
    date,
    type,
    units,
    eur_amount: eurAmount,
    realized_pnl: null,
    notes,
    source,
    external_id: externalId,
    deleted_at: null,
  };
}

export function updateTransaction(
  id: number,
  updates: Partial<Pick<Transaction, "date" | "type" | "units" | "eur_amount" | "notes">>
): void {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (updates.date !== undefined) { sets.push("date = ?"); vals.push(updates.date); }
  if (updates.type !== undefined) { sets.push("type = ?"); vals.push(updates.type); }
  if (updates.units !== undefined) { sets.push("units = ?"); vals.push(updates.units); }
  if (updates.eur_amount !== undefined) { sets.push("eur_amount = ?"); vals.push(updates.eur_amount); }
  if (updates.notes !== undefined) { sets.push("notes = ?"); vals.push(updates.notes); }

  if (sets.length === 0) return;
  vals.push(id);
  db.run(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export function softDeleteTransaction(id: number): void {
  db.run(
    "UPDATE transactions SET deleted_at = ? WHERE id = ?",
    [new Date().toISOString(), id]
  );
}

export function getBuyLotsForAsset(assetId: number): Array<{ id: number; date: string; units: number; eur_amount: number }> {
  return db
    .query<{ id: number; date: string; units: number; eur_amount: number }, [number]>(
      `SELECT id, date, units, eur_amount FROM transactions
       WHERE asset_id = ? AND type = 'buy' AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);
}

export function getSellsForAsset(assetId: number): Array<{ id: number; date: string; units: number }> {
  return db
    .query<{ id: number; date: string; units: number }, [number]>(
      `SELECT id, date, units FROM transactions
       WHERE asset_id = ? AND type = 'sell' AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);
}

export interface TransactionSummary {
  totalInvested: number;
  unitsBought: number;
  unitsSold: number;
}

export function getTransactionSummaryByAsset(assetId: number): TransactionSummary {
  const row = db.query<{
    total_invested: number;
    units_bought: number;
    units_sold: number;
  }, [number]>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(eur_amount) ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(eur_amount) ELSE 0 END), 0) as total_invested,
       COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(units) ELSE 0 END), 0) as units_bought,
       COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(units) ELSE 0 END), 0) as units_sold
     FROM transactions WHERE asset_id = ? AND deleted_at IS NULL`
  ).get(assetId);
  return {
    totalInvested: row?.total_invested ?? 0,
    unitsBought: row?.units_bought ?? 0,
    unitsSold: row?.units_sold ?? 0,
  };
}

export function getInvestedEurOnDate(date: string): number {
  const row = db.query<{ total: number }, [string]>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'buy' THEN eur_amount ELSE -eur_amount END), 0) as total
     FROM transactions WHERE date <= ? AND deleted_at IS NULL`
  ).get(date);
  return row?.total ?? 0;
}

export function getInvestedEurForAssetOnDate(assetId: number, date: string): number {
  const row = db.query<{ total: number }, [number, string]>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'buy' THEN eur_amount ELSE -eur_amount END), 0) as total
     FROM transactions WHERE asset_id = ? AND date <= ? AND deleted_at IS NULL`
  ).get(assetId, date);
  return row?.total ?? 0;
}
