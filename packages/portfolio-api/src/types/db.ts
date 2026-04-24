export interface Exchange {
  id: number;
  name: string;
  type: "crypto" | "broker" | "manual";
}

export interface Asset {
  id: number;
  symbol: string;
  name: string;
  type: "crypto" | "etf" | "cash" | "stock";
  exchange_id: number;
  yahoo_ticker: string | null;
  coingecko_id: string | null;
}

export interface Transaction {
  id: number;
  asset_id: number;
  date: string;
  type: "buy" | "sell";
  units: number;
  eur_amount: number;
  realized_pnl: number | null;
  notes: string | null;
  source: "manual" | "imported";
  external_id: string | null;
  deleted_at: string | null;
}

export interface PriceCache {
  asset_id: number;
  date: string;
  price_eur: number;
  exchange_rate: number;
}

export interface NetWorthSnapshot {
  date: string;
  total_eur: number;
  invested_eur: number;
}

export interface PositionSnapshot {
  date: string;
  asset_id: number;
  units_held: number;
  price_eur: number;
  value_eur: number;
  invested_eur: number;
}

export interface SchemaMigration {
  id: number;
  filename: string;
  applied_at: string;
}
