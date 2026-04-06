import { db } from "../runner";
import type { NetWorthSnapshot } from "../../types/db";

export function listSnapshots(): NetWorthSnapshot[] {
  return db
    .query<NetWorthSnapshot, []>(
      `SELECT
         s.date,
         s.total_eur,
         (
           SELECT COALESCE(
             SUM(
               CASE
                 WHEN t.type = 'buy' THEN t.eur_amount
                 ELSE -t.eur_amount
               END
             ),
             0
           )
           FROM transactions t
           WHERE t.date <= s.date AND t.deleted_at IS NULL
         ) AS invested_eur
       FROM net_worth_snapshots s
       ORDER BY s.date ASC`
    )
    .all();
}

export function getSnapshot(date: string): NetWorthSnapshot | null {
  return db
    .query<NetWorthSnapshot, [string]>(
      `SELECT
         s.date,
         s.total_eur,
         (
           SELECT COALESCE(
             SUM(
               CASE
                 WHEN t.type = 'buy' THEN t.eur_amount
                 ELSE -t.eur_amount
               END
             ),
             0
           )
           FROM transactions t
           WHERE t.date <= s.date AND t.deleted_at IS NULL
         ) AS invested_eur
       FROM net_worth_snapshots s
       WHERE s.date = ?`
    )
    .get(date);
}

export function upsertSnapshot(date: string, totalEur: number): void {
  db.run(
    `INSERT INTO net_worth_snapshots (date, total_eur) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET total_eur = excluded.total_eur`,
    [date, totalEur]
  );
}

export function getEarliestTransactionDate(): string | null {
  const result = db
    .query<{ min_date: string | null }, []>(
      "SELECT MIN(date) as min_date FROM transactions WHERE deleted_at IS NULL"
    )
    .get();
  return result?.min_date ?? null;
}
