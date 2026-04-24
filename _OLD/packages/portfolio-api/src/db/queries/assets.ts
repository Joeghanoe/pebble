import { db } from "../runner";
import type { Asset } from "../../types/db";

export function listAssets(): Asset[] {
  return db
    .query<Asset, []>(
      "SELECT id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id FROM assets ORDER BY symbol ASC"
    )
    .all();
}

export function getAssetById(id: number): Asset | null {
  return db
    .query<Asset, [number]>(
      "SELECT id, symbol, name, type, exchange_id, yahoo_ticker, coingecko_id FROM assets WHERE id = ?"
    )
    .get(id);
}

export function createAsset(
  symbol: string,
  name: string,
  type: Asset["type"],
  exchangeId: number,
  yahooTicker: string | null,
  coingeckoId: string | null
): Asset {
  const result = db
    .query<{ id: number }, [string, string, string, number, string | null, string | null]>(
      `INSERT INTO assets (symbol, name, type, exchange_id, yahoo_ticker, coingecko_id)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(symbol, name, type, exchangeId, yahooTicker, coingeckoId);
  if (!result) throw new Error("Failed to create asset");
  return {
    id: result.id,
    symbol,
    name,
    type,
    exchange_id: exchangeId,
    yahoo_ticker: yahooTicker,
    coingecko_id: coingeckoId,
  };
}

export function updateAsset(id: number, updates: Partial<Omit<Asset, "id">>): void {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (updates.symbol !== undefined) { sets.push("symbol = ?"); vals.push(updates.symbol); }
  if (updates.name !== undefined) { sets.push("name = ?"); vals.push(updates.name); }
  if (updates.type !== undefined) { sets.push("type = ?"); vals.push(updates.type); }
  if (updates.exchange_id !== undefined) { sets.push("exchange_id = ?"); vals.push(updates.exchange_id); }
  if (updates.yahoo_ticker !== undefined) { sets.push("yahoo_ticker = ?"); vals.push(updates.yahoo_ticker); }
  if (updates.coingecko_id !== undefined) { sets.push("coingecko_id = ?"); vals.push(updates.coingecko_id); }

  if (sets.length === 0) return;
  vals.push(id);
  db.run(`UPDATE assets SET ${sets.join(", ")} WHERE id = ?`, vals);
}
