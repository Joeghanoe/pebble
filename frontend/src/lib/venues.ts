// src/lib/venues.ts
//
// Where the money sits. Pure: positions in, slices out, so it is unit-tested
// without a query client.
import type { Position } from "@/types/api";

export interface VenueSlice {
  /** Null for history recorded before venues existed and never assigned. */
  venue: string | null;
  value: number;
  fraction: number;
  /** What is held there, largest first. */
  symbols: string[];
}

/**
 * Portfolio value by venue. Each position's value is split in proportion to the
 * units at each venue, so an unpriced position and cash come out the same way
 * the position total does.
 */
export function venueBreakdown(
  positions: readonly Pick<
    Position,
    "asset" | "venues" | "units_held" | "current_value_eur"
  >[],
): VenueSlice[] {
  const byVenue = new Map<
    string | null,
    { value: number; symbols: { symbol: string; value: number }[] }
  >();
  for (const p of positions) {
    if (p.units_held <= 0) {
      continue;
    }
    for (const holding of p.venues) {
      const value = (holding.units / p.units_held) * p.current_value_eur;
      const entry = byVenue.get(holding.venue) ?? { value: 0, symbols: [] };
      entry.value += value;
      entry.symbols.push({ symbol: p.asset.symbol, value });
      byVenue.set(holding.venue, entry);
    }
  }
  const total = [...byVenue.values()].reduce((sum, e) => sum + e.value, 0);
  return [...byVenue.entries()]
    .map(([venue, e]) => ({
      venue,
      value: e.value,
      fraction: total > 0 ? e.value / total : 0,
      symbols: e.symbols.sort((a, b) => b.value - a.value).map((s) => s.symbol),
    }))
    .sort((a, b) => b.value - a.value);
}
