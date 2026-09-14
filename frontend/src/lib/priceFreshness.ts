// src/lib/priceFreshness.ts

import type { PriceResult } from "@/types/price";

export interface PriceFreshness {
  /** The caption under a price: what it is and when it is from. */
  readonly label: string;
  /** True only when the price is older than this asset class ever goes. */
  readonly overdue: boolean;
}

/**
 * How long a price may go unchanged before something is actually wrong.
 *
 * A listed fund has no price at all outside market hours, and a long weekend
 * puts four calendar days between two closes. Crypto never closes, so a price
 * from the day before yesterday means the feed stopped, not that the market
 * did.
 */
const TOLERANCE_DAYS: Record<string, number> = { crypto: 1 };
const DEFAULT_TOLERANCE_DAYS = 4;

function ageInDays(from: string, today: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * The API flags a price `stale` when the *live fetch failed*, which is not the
 * same question as whether the number on screen is old. An ETF quote falls back
 * to the last close every evening and all weekend; labelling that "stale" tells
 * you a market is closed, which you knew, and buries the one case worth
 * knowing about — a feed that has actually stopped.
 *
 * So the flag decides the wording and the price's *age* decides the alarm: a
 * close within the asset's normal rhythm reads as a close, and only a price
 * that has outlived that rhythm is called out.
 */
export function priceFreshness(
  result: PriceResult | undefined,
  assetType: string,
  today: string = new Date().toISOString().slice(0, 10),
): PriceFreshness | null {
  if (!result || result.status === "unavailable") {
    return null;
  }
  if (result.status === "ok") {
    return { label: "live", overdue: false };
  }
  const age = ageInDays(result.last_known_date, today);
  const tolerance = TOLERANCE_DAYS[assetType] ?? DEFAULT_TOLERANCE_DAYS;
  if (age <= tolerance) {
    return {
      label: age === 0 ? "today's close" : `close · ${result.last_known_date}`,
      overdue: false,
    };
  }
  return {
    label: `no update since ${result.last_known_date}`,
    overdue: true,
  };
}
