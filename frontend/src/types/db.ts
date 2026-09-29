export type Exchange = {
  id: number;
  name: string;
  type: "crypto" | "broker" | "manual";
};

export type Asset = {
  id: number;
  symbol: string;
  name: string;
  type: "crypto" | "etf" | "cash" | "stock";
  /** Legacy: venues now live on each transaction. Null for newer positions. */
  exchange_id: number | null;
  yahoo_ticker?: string | null;
  coingecko_id?: string | null;
};

export type Transaction = {
  id: number;
  asset_id: number;
  date: string;
  /** A move relocates units between venues; it carries no money. */
  type: "buy" | "sell" | "move";
  units: number;
  eur_amount: number;
  notes?: string | null;
  /** Where it happened. For a move, where the units left from. */
  venue?: string | null;
  /** A move's destination. Null on every other type. */
  to_venue?: string | null;
  /**
   * What a sell actually made, FIFO against the buy lots — the API computes it
   * per row in `list_transactions_by_asset`. Null on a buy, which has realised
   * nothing yet.
   */
  realized_pnl?: number | null;
};
