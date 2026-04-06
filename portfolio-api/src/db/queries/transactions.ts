import { db } from "../runner";
import type { Transaction } from "../../types/db";

export function listTransactionsByAsset(assetId: number): Transaction[] {
  return db
    .query<Transaction, [number]>(
      `SELECT id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at
       FROM transactions
       WHERE asset_id = ? AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);
}

export function getTransactionById(id: number): Transaction | null {
  return db
    .query<Transaction, [number]>(
      `SELECT id, asset_id, date, type, units, eur_amount, realized_pnl, notes, source, external_id, deleted_at
       FROM transactions WHERE id = ?`
    )
    .get(id);
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
  updates: Partial<Pick<Transaction, "date" | "type" | "units" | "eur_amount" | "realized_pnl" | "notes">>
): void {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (updates.date !== undefined) { sets.push("date = ?"); vals.push(updates.date); }
  if (updates.type !== undefined) { sets.push("type = ?"); vals.push(updates.type); }
  if (updates.units !== undefined) { sets.push("units = ?"); vals.push(updates.units); }
  if (updates.eur_amount !== undefined) { sets.push("eur_amount = ?"); vals.push(updates.eur_amount); }
  if (updates.realized_pnl !== undefined) { sets.push("realized_pnl = ?"); vals.push(updates.realized_pnl); }
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

export function setTransactionRealizedPnl(id: number, pnl: number | null): void {
  db.run("UPDATE transactions SET realized_pnl = ? WHERE id = ?", [pnl, id]);
}

/** Get all active buy transactions for an asset, ordered for FIFO */
export function getBuyLotsForAsset(assetId: number): Array<{ id: number; date: string; units: number; eur_amount: number }> {
  return db
    .query<{ id: number; date: string; units: number; eur_amount: number }, [number]>(
      `SELECT id, date, units, eur_amount FROM transactions
       WHERE asset_id = ? AND type = 'buy' AND deleted_at IS NULL
       ORDER BY date ASC, id ASC`
    )
    .all(assetId);
}

/** Get all active sell transactions for an asset */
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
  realizedPnl: number;
}

export function getTransactionSummaryByAsset(assetId: number): TransactionSummary {
  const row = db.query<{
    total_invested: number;
    units_bought: number;
    units_sold: number;
    realized_pnl: number;
  }, [number]>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(eur_amount) ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(eur_amount) ELSE 0 END), 0) as total_invested,
       COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(units) ELSE 0 END), 0) as units_bought,
       COALESCE(SUM(CASE WHEN type = 'sell' THEN ABS(units) ELSE 0 END), 0) as units_sold,
       COALESCE(SUM(CASE WHEN type = 'sell' THEN COALESCE(realized_pnl, 0) ELSE 0 END), 0) as realized_pnl
     FROM transactions WHERE asset_id = ? AND deleted_at IS NULL`
  ).get(assetId);
  return {
    totalInvested: row?.total_invested ?? 0,
    unitsBought: row?.units_bought ?? 0,
    unitsSold: row?.units_sold ?? 0,
    realizedPnl: row?.realized_pnl ?? 0,
  };
}
