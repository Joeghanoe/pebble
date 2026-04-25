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
  exchange_id: number;
  yahoo_ticker?: string | null;
  coingecko_id?: string | null;
};

export type Transaction = {
  id: number;
  asset_id: number;
  date: string;
  type: "buy" | "sell";
  units: number;
  eur_amount: number;
  notes?: string | null;
};
