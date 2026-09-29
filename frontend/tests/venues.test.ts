import { describe, expect, test } from "bun:test";
import { venueBreakdown } from "../src/lib/venues";

type Row = Parameters<typeof venueBreakdown>[0][number];

function position(
  symbol: string,
  type: "crypto" | "etf" | "stock" | "cash",
  value: number,
  venues: { venue: string | null; units: number }[],
): Row {
  const units = venues.reduce((sum, v) => sum + v.units, 0);
  return {
    asset: {
      id: 0,
      symbol,
      name: symbol,
      type,
      exchange_id: null,
    },
    venues,
    units_held: units,
    current_value_eur: value,
  };
}

describe("venueBreakdown", () => {
  test("splits each position's value by the units at each venue", () => {
    const slices = venueBreakdown([
      position("BTC", "crypto", 10_000, [
        { venue: "Bitvavo", units: 0.06 },
        { venue: "MetaMask", units: 0.04 },
      ]),
      position("VUAA", "etf", 5_000, [{ venue: "Revolut", units: 50 }]),
      position("EUR", "cash", 3_000, [
        { venue: "Revolut", units: 2_500 },
        { venue: "Bitvavo", units: 500 },
      ]),
    ]);

    expect(slices.map((s) => [s.venue, Math.round(s.value)])).toEqual([
      ["Revolut", 7_500],
      ["Bitvavo", 6_500],
      ["MetaMask", 4_000],
    ]);
    const revolut = slices.find((s) => s.venue === "Revolut");
    expect(revolut?.symbols).toEqual(["VUAA", "EUR"]);
    expect(slices.reduce((sum, s) => sum + s.fraction, 0)).toBeCloseTo(1, 12);
  });

  test("keeps unassigned history as its own slice", () => {
    const slices = venueBreakdown([
      position("ETH", "crypto", 1_000, [{ venue: null, units: 1 }]),
    ]);
    expect(slices).toEqual([
      { venue: null, value: 1_000, fraction: 1, symbols: ["ETH"] },
    ]);
  });

  test("an empty portfolio has no slices", () => {
    expect(venueBreakdown([])).toEqual([]);
  });
});
