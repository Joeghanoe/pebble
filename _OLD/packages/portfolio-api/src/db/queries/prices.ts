import { db } from "../runner";
import type { PriceCache } from "../../types/db";

export function getPriceForDate(assetId: number, date: string): PriceCache | null {
  return db
    .query<PriceCache, [number, string]>(
      "SELECT asset_id, date, price_eur, exchange_rate FROM price_cache WHERE asset_id = ? AND date = ?"
    )
    .get(assetId, date);
}

export function getLatestPrice(assetId: number): PriceCache | null {
  return db
    .query<PriceCache, [number]>(
      "SELECT asset_id, date, price_eur, exchange_rate FROM price_cache WHERE asset_id = ? ORDER BY date DESC LIMIT 1"
    )
    .get(assetId);
}

export function getLatestExchangeRate(): number | null {
  const row = db
    .query<{ exchange_rate: number }, []>(
      "SELECT exchange_rate FROM price_cache ORDER BY date DESC LIMIT 1"
    )
    .get();

  return row?.exchange_rate ?? null;
}

export function upsertPrice(
  assetId: number,
  date: string,
  priceEur: number,
  exchangeRate: number
): void {
  db.run(
    `INSERT INTO price_cache (asset_id, date, price_eur, exchange_rate)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(asset_id, date) DO UPDATE SET price_eur = excluded.price_eur, exchange_rate = excluded.exchange_rate`,
    [assetId, date, priceEur, exchangeRate]
  );
}

export function getPricesForAsset(assetId: number): PriceCache[] {
  return db
    .query<PriceCache, [number]>(
      "SELECT asset_id, date, price_eur, exchange_rate FROM price_cache WHERE asset_id = ? ORDER BY date ASC"
    )
    .all(assetId);
}

/** Get most recent price at or before a given date */
export function getPriceOnOrBefore(assetId: number, date: string): PriceCache | null {
  return db
    .query<PriceCache, [number, string]>(
      "SELECT asset_id, date, price_eur, exchange_rate FROM price_cache WHERE asset_id = ? AND date <= ? ORDER BY date DESC LIMIT 1"
    )
    .get(assetId, date);
}
