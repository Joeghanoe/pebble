export type PriceResult =
  | { status: "ok"; price_eur: number; exchange_rate: number; date: string }
  | {
      status: "stale";
      price_eur: number;
      exchange_rate: number;
      last_known_date: string;
    }
  | { status: "unavailable" };
