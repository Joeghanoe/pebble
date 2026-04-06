import type { Asset, Exchange, Transaction } from "./db";
import type { PriceResult } from "./price";

// ---- Positions ----

export interface PositionRow {
  asset: Asset;
  exchange: Exchange;
  unitsHeld: number;
  totalInvestedEur: number;
  currentValueEur: number;
  pnlPct: number;
  realizedPnl: number;
  priceResult: PriceResult;
}

export interface GetPositionsResponse {
  positions: PositionRow[];
  lastUpdated: string | null;
}

// ---- Transactions ----

export interface GetTransactionsResponse {
  transactions: Transaction[];
}

export interface CreateTransactionRequest {
  assetId: number;
  date: string;
  type: "buy" | "sell";
  units: number;
  eurAmount: number;
  notes?: string;
}

export interface UpdateTransactionRequest {
  date?: string;
  type?: "buy" | "sell";
  units?: number;
  eurAmount?: number;
  notes?: string;
}

// ---- Assets ----

export interface GetAssetsResponse {
  assets: Asset[];
}

export interface CreateAssetRequest {
  symbol: string;
  name: string;
  type: "crypto" | "etf" | "cash";
  exchangeId: number;
  yahooTicker?: string;
  coingeckoId?: string;
}

export interface UpdateAssetRequest {
  symbol?: string;
  name?: string;
  type?: "crypto" | "etf" | "cash";
  exchangeId?: number;
  yahooTicker?: string | null;
  coingeckoId?: string | null;
}

// ---- Exchanges ----

export interface GetExchangesResponse {
  exchanges: Exchange[];
}

export interface CreateExchangeRequest {
  name: string;
  type: "crypto" | "broker" | "manual";
}

// ---- Prices ----

export interface RefreshPricesResponse {
  throttled: boolean;
  reason?: "cooldown" | "in_progress";
  nextAllowedAt?: string;
  results: Array<{
    assetId: number;
    symbol: string;
    result: PriceResult;
  }>;
}

// ---- Net Worth ----

export interface GetNetWorthResponse {
  snapshots: Array<{ date: string; total_eur: number; invested_eur: number }>;
}

// ---- API error ----

export interface ApiError {
  error: string;
}
