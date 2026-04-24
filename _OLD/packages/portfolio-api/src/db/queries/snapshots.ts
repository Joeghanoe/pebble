import { db } from "../runner";
import type { NetWorthSnapshot, PositionSnapshot } from "../../types/db";

export function listSnapshots(): NetWorthSnapshot[] {
  return db
    .query<NetWorthSnapshot, []>(
      `SELECT date, total_eur, invested_eur FROM net_worth_snapshots ORDER BY date ASC`
    )
    .all();
}

export function listSnapshotsAggregated(period: "1d" | "1w" | "1m"): NetWorthSnapshot[] {
  if (period === "1d") {
    return db
      .query<NetWorthSnapshot, []>(
        `SELECT date, total_eur, invested_eur FROM net_worth_snapshots
         ORDER BY date DESC LIMIT 60`
      )
      .all()
      .reverse();
  }

  const bucket = period === "1w" ? "strftime('%Y-%W', date)" : "strftime('%Y-%m', date)";
  return db
    .query<NetWorthSnapshot, []>(
      `SELECT s.date, s.total_eur, s.invested_eur
       FROM net_worth_snapshots s
       JOIN (
         SELECT MAX(date) AS max_date
         FROM net_worth_snapshots
         GROUP BY ${bucket}
         ORDER BY max_date DESC
         LIMIT 60
       ) g ON s.date = g.max_date
       ORDER BY s.date ASC`
    )
    .all();
}

export function getSnapshot(date: string): NetWorthSnapshot | null {
  return db
    .query<NetWorthSnapshot, [string]>(
      `SELECT date, total_eur, invested_eur FROM net_worth_snapshots WHERE date = ?`
    )
    .get(date);
}

export function upsertSnapshot(date: string, totalEur: number, investedEur: number): void {
  db.run(
    `INSERT INTO net_worth_snapshots (date, total_eur, invested_eur) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_eur = excluded.total_eur, invested_eur = excluded.invested_eur`,
    [date, totalEur, investedEur]
  );
}

export function upsertPositionSnapshot(
  date: string,
  assetId: number,
  unitsHeld: number,
  priceEur: number,
  valueEur: number,
  investedEur: number
): void {
  db.run(
    `INSERT INTO position_snapshots (date, asset_id, units_held, price_eur, value_eur, invested_eur)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date, asset_id) DO UPDATE SET
       units_held = excluded.units_held,
       price_eur = excluded.price_eur,
       value_eur = excluded.value_eur,
       invested_eur = excluded.invested_eur`,
    [date, assetId, unitsHeld, priceEur, valueEur, investedEur]
  );
}

export function listPositionSnapshots(): PositionSnapshot[] {
  return db
    .query<PositionSnapshot, []>(
      `SELECT date, asset_id, units_held, price_eur, value_eur, invested_eur
       FROM position_snapshots ORDER BY date ASC, asset_id ASC`
    )
    .all();
}

export function getEarliestTransactionDate(): string | null {
  const result = db
    .query<{ min_date: string | null }, []>(
      "SELECT MIN(date) as min_date FROM transactions WHERE deleted_at IS NULL"
    )
    .get();
  return result?.min_date ?? null;
}
