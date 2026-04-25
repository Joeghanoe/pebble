import type { Asset, Exchange, Transaction } from "./db";
import type { PriceResult } from "./price";

export type Position = {
  asset: Asset;
  current_value_eur: number;
  total_invested_eur: number;
  units_held: number;
  pnl_pct: number;
  price_result: PriceResult;
};

export type NetWorthSnapshot = {
  date: string;
  total_eur: number;
  invested_eur: number;
};

export type GetPositionsResponse = {
  positions: Position[];
};

export type GetNetWorthResponse = {
  snapshots: NetWorthSnapshot[];
};

export type GetTransactionsResponse = {
  transactions: Transaction[];
};

export type GetExchangesResponse = {
  exchanges: Exchange[];
};

export type RefreshPricesResponse = {
  throttled: boolean;
};
