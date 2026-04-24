export type PriceResult =
  | { status: "ok"; priceEur: number; date: string; exchangeRate: number }
  | { status: "stale"; priceEur: number; lastKnownDate: string; exchangeRate: number }
  | { status: "unavailable" };
