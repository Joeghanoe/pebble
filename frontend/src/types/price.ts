export type PriceResult =
  | { status: "ok"; priceEur: number; exchangeRate: number | null }
  | { status: "stale"; priceEur: number; exchangeRate: number | null; lastKnownDate: string }
  | { status: "unavailable" }
