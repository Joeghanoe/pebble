import type { Asset, Exchange, Transaction } from "./db";
import type { PriceResult } from "./price";

export type Position = {
  asset: Asset;
  exchange: Exchange;
  current_value_eur: number;
  total_invested_eur: number;
  units_held: number;
  pnl_pct: number;
  realized_pnl: number;
  price_result: PriceResult;
};

export type NetWorthSnapshot = {
  date: string;
  total_eur: number;
  invested_eur: number;
  /**
   * The BTC price that day, for denominating the series in BTC. Null before the
   * first BTC price, and for a portfolio that holds none — points the BTC view
   * leaves out rather than dividing by a rate that did not exist.
   */
  btc_eur: number | null;
};

export type GetPositionsResponse = {
  positions: Position[];
  /** When the price cache was last written. Null before the first refresh. */
  last_updated: string | null;
};

export type PositionHistoryPoint = {
  date: string;
  units_held: number;
  price_eur: number;
  value_eur: number;
  invested_eur: number;
};

export type GetPositionHistoryResponse = {
  points: PositionHistoryPoint[];
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
