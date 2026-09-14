// src/lib/cadence.ts
import type { Transaction } from "@/types/db";

/** One buy, and how long it had been since the previous one. */
export interface CadenceBar {
  date: string;
  /** Days since the previous buy. Null on the first: nothing to measure from. */
  gapDays: number | null;
  /** Well past the usual rhythm — see `LAPSE_MULTIPLE`. */
  isLapse: boolean;
}

export interface Cadence {
  bars: CadenceBar[];
  buys: number;
  /** The usual rhythm, in days. Null until there are two buys to span. */
  medianGapDays: number | null;
  longestGapDays: number | null;
  longestGapDate: string | null;
  /** Days since the most recent buy — whether the streak is still live. */
  daysSinceLast: number | null;
  /** True when the current dry spell is itself already a lapse. */
  isLapsedNow: boolean;
}

/**
 * How far past the usual rhythm a gap has to be before it reads as a lapse.
 *
 * Half again as long is the point where a gap stops being ordinary jitter —
 * a fortnightly habit slipping to three weeks — and starts being a month
 * skipped. Low enough to catch real drift, high enough that a holiday or a
 * payday landing on a weekend does not light the chart up.
 */
const LAPSE_MULTIPLE = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two ISO dates, via UTC so a DST boundary cannot shift it. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The rhythm of buying into a position: how often, and where it slipped.
 *
 * Each buy carries the gap before it, so the chart can plot the dates and still
 * name what it is showing: the slope between two marks *is* that gap, and the
 * summary figures — usual gap, longest gap, days since the last buy — are the
 * same numbers stated outright for the reader who wants one.
 *
 * Sells are left out. This is about the habit of putting money in; taking some
 * back out is a different decision and would read as a break in a streak that
 * never happened.
 *
 * The centre is the median, not the mean: one six-month lapse would drag a mean
 * far enough to make the surrounding months look tighter than they were.
 */
export function buildCadence(
  transactions: readonly Transaction[],
  today: string = new Date().toISOString().slice(0, 10),
): Cadence {
  const buys = [...transactions]
    .filter((t) => t.type === "buy")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (buys.length === 0) {
    return {
      bars: [],
      buys: 0,
      medianGapDays: null,
      longestGapDays: null,
      longestGapDate: null,
      daysSinceLast: null,
      isLapsedNow: false,
    };
  }

  const gaps = buys.map((buy, index) =>
    index === 0 ? null : daysBetween(buys[index - 1].date, buy.date),
  );
  const measured = gaps.filter((gap): gap is number => gap !== null);
  const medianGapDays = median(measured);

  const bars: CadenceBar[] = buys.map((buy, index) => ({
    date: buy.date,
    gapDays: gaps[index],
    isLapse:
      medianGapDays !== null &&
      gaps[index] !== null &&
      gaps[index]! > medianGapDays * LAPSE_MULTIPLE,
  }));

  let longestGapDays: number | null = null;
  let longestGapDate: string | null = null;
  for (const bar of bars) {
    if (
      bar.gapDays !== null &&
      (longestGapDays === null || bar.gapDays > longestGapDays)
    ) {
      longestGapDays = bar.gapDays;
      longestGapDate = bar.date;
    }
  }

  const daysSinceLast = daysBetween(buys[buys.length - 1].date, today);

  return {
    bars,
    buys: buys.length,
    medianGapDays,
    longestGapDays,
    longestGapDate,
    daysSinceLast,
    isLapsedNow:
      medianGapDays !== null && daysSinceLast > medianGapDays * LAPSE_MULTIPLE,
  };
}

/** "every ~6 weeks" — the rhythm in the unit that reads most naturally. */
export function describeCadence(days: number | null): string {
  if (days === null) {
    return "not enough buys yet";
  }
  if (days < 10) {
    return `every ~${Math.round(days)} days`;
  }
  if (days < 60) {
    return `every ~${Math.round(days / 7)} weeks`;
  }
  return `every ~${Math.round(days / 30.44)} months`;
}
