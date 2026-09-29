import type { Asset, Exchange, Transaction } from "./db";
import type { PriceResult } from "./price";

/** Units of a position held at one venue. `venue` is null for unassigned history. */
export type VenueHolding = {
  venue: string | null;
  units: number;
};

export type Position = {
  asset: Asset;
  exchange: Exchange | null;
  /** Units per venue, largest first; they sum to `units_held`. */
  venues: VenueHolding[];
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
  /** `cooldown` or `in_progress`, when the server declined to pull. */
  reason?: string | null;
  /** When the next pull is allowed, ISO 8601. Null when nothing is holding. */
  next_allowed_at?: string | null;
};

export type BtcDailyClose = {
  date: string;
  price_eur: number;
};

/** A year of daily BTC closes as cached, oldest first. Gaps are not filled. */
export type GetBtcDailyResponse = {
  closes: BtcDailyClose[];
};

export type VenueSummary = {
  name: string;
  /** How many live transactions name it, at either end of a move. */
  transactions: number;
};

export type GetVenuesResponse = {
  venues: VenueSummary[];
};
