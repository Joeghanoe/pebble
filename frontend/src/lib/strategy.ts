// src/lib/strategy.ts
//
// The arithmetic behind the Strategy view: which regime the DCA rule is in, and
// where the contributions are heading. Pure functions over plain numbers and ISO
// date strings — no queries, no React, no `Date.now()` — so every rule here is
// pinned by a unit test rather than by eyeballing a screen.
//
// Dates are 'YYYY-MM-DD' throughout and all calendar arithmetic is done in UTC,
// so a user east of Greenwich never sees a day slip.

/* ── Dates ───────────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return { y, m, d };
}

function toUtcMs(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

/**
 * `months` calendar months later, clamped to the end of a shorter month:
 * 31 January plus one month is 28 (or 29) February, never 3 March.
 */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parseIso(iso);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`;
}

/**
 * Whole calendar months from `from` to `to`, which is the number of monthly
 * contributions still to be made. Zero once `to` has been reached or passed.
 */
export function monthsBetween(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  const months = (b.y - a.y) * 12 + (b.m - a.m) - (b.d < a.d ? 1 : 0);
  return Math.max(0, months);
}

/** The day someone born on `birthdate` turns `age`. A 29 February birthday lands on the 28th. */
export function birthdayAt(birthdate: string, age: number): string {
  return addMonths(birthdate, age * 12);
}

/* ── Daily closes ────────────────────────────────────────────────────────── */

export interface DailyClose {
  readonly date: string;
  readonly close: number;
}

/**
 * How many missing days a close may be carried across. BTC trades every day, so
 * a missing day is a feed that skipped, not a closed market; a short skip is
 * harmless to a 200-day average, a long one is not data at all.
 */
export const MAX_CARRY_FORWARD_DAYS = 3;

/**
 * The newest unbroken run of daily closes, with short gaps carried forward.
 *
 * The cache holds a year of dailies behind a tail of month-end points from the
 * snapshot backfill. Counting those month ends as "days" would stretch a
 * 200-day average over years, so any gap longer than `maxCarry` days cuts the
 * series and only what comes after it is kept.
 */
export function contiguousDailyCloses(
  points: readonly { date: string; price: number }[],
  maxCarry: number = MAX_CARRY_FORWARD_DAYS,
): DailyClose[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let run: DailyClose[] = [];
  for (const point of sorted) {
    const last = run[run.length - 1];
    if (!last) {
      run.push({ date: point.date, close: point.price });
      continue;
    }
    const gap = daysBetween(last.date, point.date);
    if (gap <= 0) {
      // A repeated date: the later row wins, as an upsert would.
      run[run.length - 1] = { date: point.date, close: point.price };
      continue;
    }
    if (gap - 1 > maxCarry) {
      run = [{ date: point.date, close: point.price }];
      continue;
    }
    for (let missing = 1; missing < gap; missing++) {
      run.push({ date: addDays(last.date, missing), close: last.close });
    }
    run.push({ date: point.date, close: point.price });
  }
  return run;
}

/**
 * The trailing simple moving average: entry `i` is the mean of `values[i - window + 1..i]`,
 * or null until a full window exists. A running sum keeps it linear.
 */
export function sma(
  values: readonly number[],
  window: number,
): (number | null)[] {
  if (!Number.isInteger(window) || window < 1) {
    throw new RangeError(
      `SMA window must be a positive integer, got ${window}`,
    );
  }
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) {
      sum -= values[i - window];
    }
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/* ── Regime ──────────────────────────────────────────────────────────────── */

export const SMA_WINDOW = 200;
export const CONFIRM_DAYS = 30;
/** A full average, then a full confirmation streak on top of it. */
export const MIN_HISTORY_DAYS = SMA_WINDOW + CONFIRM_DAYS;

export type Regime = "defensive" | "risk-on";

export interface Split {
  readonly crypto: number;
  readonly equity: number;
}

export const REGIME_SPLIT: Record<Regime, Split> = {
  defensive: { crypto: 0.5, equity: 0.5 },
  "risk-on": { crypto: 0.25, equity: 0.75 },
};

/** Which side of the average a close sits on. Exactly on it counts as neither. */
export type Side = "above" | "below" | "on";

export interface RegimeReading {
  readonly date: string;
  readonly close: number;
  readonly sma: number;
  /** (close − sma) / sma, in percent. */
  readonly distancePct: number;
  readonly side: Side;
  /** Consecutive closes on `side`, including this one. Zero when `side` is "on". */
  readonly streakDays: number;
}

export type RegimeState =
  | {
      readonly status: "insufficient";
      readonly availableDays: number;
      readonly requiredDays: number;
    }
  | {
      /** Enough history, but no 30-day streak on either side has happened yet. */
      readonly status: "unestablished";
      readonly reading: RegimeReading;
    }
  | {
      readonly status: "established";
      readonly regime: Regime;
      /** The close that completed the 30-day streak and switched the rule over. */
      readonly since: string;
      readonly reading: RegimeReading;
      /** Days of the current streak against the regime, 0..CONFIRM_DAYS−1. */
      readonly daysTowardSwitch: number;
    };

/**
 * The DCA rule, replayed over the whole series.
 *
 * Thirty consecutive closes below the 200-day average switch to Defensive,
 * thirty above switch to Risk-on, and anything short of that leaves the
 * previous regime standing — the hysteresis that keeps one wick across the
 * line from flipping the split. A close exactly on the average breaks both
 * streaks, since it is on neither side.
 *
 * Expects `closes` to be consecutive days (see `contiguousDailyCloses`); the
 * rule counts days, so a series with holes would count the wrong thing.
 */
export function detectRegime(closes: readonly DailyClose[]): RegimeState {
  if (closes.length < MIN_HISTORY_DAYS) {
    return {
      status: "insufficient",
      availableDays: closes.length,
      requiredDays: MIN_HISTORY_DAYS,
    };
  }

  const averages = sma(
    closes.map((c) => c.close),
    SMA_WINDOW,
  );

  let regime: Regime | null = null;
  let since = "";
  let above = 0;
  let below = 0;

  for (let i = SMA_WINDOW - 1; i < closes.length; i++) {
    const close = closes[i].close;
    const average = averages[i] as number;
    if (close > average) {
      above += 1;
      below = 0;
    } else if (close < average) {
      below += 1;
      above = 0;
    } else {
      above = 0;
      below = 0;
    }

    if (above >= CONFIRM_DAYS && regime !== "risk-on") {
      regime = "risk-on";
      since = closes[i].date;
    } else if (below >= CONFIRM_DAYS && regime !== "defensive") {
      regime = "defensive";
      since = closes[i].date;
    }
  }

  const last = closes[closes.length - 1];
  const lastAverage = averages[averages.length - 1] as number;
  const side: Side =
    last.close > lastAverage
      ? "above"
      : last.close < lastAverage
        ? "below"
        : "on";
  const reading: RegimeReading = {
    date: last.date,
    close: last.close,
    sma: lastAverage,
    distancePct: ((last.close - lastAverage) / lastAverage) * 100,
    side,
    streakDays: side === "above" ? above : side === "below" ? below : 0,
  };

  if (regime === null) {
    return { status: "unestablished", reading };
  }
  return {
    status: "established",
    regime,
    since,
    reading,
    daysTowardSwitch: regime === "risk-on" ? below : above,
  };
}

/** This month's contribution, split by the regime. */
export function splitContribution(
  contribution: number,
  split: Split,
): { crypto: number; equity: number } {
  return {
    crypto: contribution * split.crypto,
    equity: contribution * split.equity,
  };
}

/* ── Projection ──────────────────────────────────────────────────────────── */

/**
 * An annual rate as the monthly rate that compounds to it: (1 + r)^(1/12) − 1.
 * Dividing by twelve would overstate growth and, for −30%, overstate the loss.
 */
export function monthlyRate(annual: number): number {
  if (!(annual > -1)) {
    throw new RangeError(`An annual return must be above −100%, got ${annual}`);
  }
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** What is held today. Cash earns nothing and receives nothing; it only counts. */
export interface Buckets {
  readonly crypto: number;
  readonly equity: number;
  readonly cash: number;
}

/** Annual return assumptions, as fractions: 0.15 is 15%/yr. */
export interface ScenarioRates {
  readonly crypto: number;
  readonly equity: number;
}

export interface ProjectionInput {
  readonly start: Buckets;
  readonly monthlyContribution: number;
  readonly split: Split;
  readonly rates: ScenarioRates;
  readonly months: number;
}

/**
 * Total value month by month: index 0 is today, index `months` is the end.
 *
 * Each month both buckets grow at their own monthly rate and then receive their
 * share of the contribution — money paid in at the end of a month has not had
 * that month to grow. The split is held fixed at the current regime's.
 */
export function projectPath(input: ProjectionInput): number[] {
  const rc = monthlyRate(input.rates.crypto);
  const re = monthlyRate(input.rates.equity);
  const toCrypto = input.monthlyContribution * input.split.crypto;
  const toEquity = input.monthlyContribution * input.split.equity;

  let crypto = input.start.crypto;
  let equity = input.start.equity;
  const cash = input.start.cash;
  const path = [crypto + equity + cash];
  for (let month = 1; month <= input.months; month++) {
    crypto = crypto * (1 + rc) + toCrypto;
    equity = equity * (1 + re) + toEquity;
    path.push(crypto + equity + cash);
  }
  return path;
}

export function projectValue(input: ProjectionInput): number {
  const path = projectPath(input);
  return path[path.length - 1];
}

/**
 * The monthly contribution that lands the projection exactly on `target`.
 *
 * Solved by bisection over the projection itself rather than an annuity formula:
 * with two buckets compounding at different rates there is no single rate to put
 * in one, and bisection keeps working if the model ever grows a step that is not
 * linear in the contribution. The projection only rises with the contribution,
 * so the search is well-posed.
 *
 * Zero when the target is reached without contributing anything more. Null when
 * no months remain, since then no contribution can change the outcome.
 */
export function requiredContribution(
  input: Omit<ProjectionInput, "monthlyContribution">,
  target: number,
): number | null {
  if (input.months <= 0) {
    return null;
  }
  const at = (monthlyContribution: number) =>
    projectValue({ ...input, monthlyContribution });

  if (at(0) >= target) {
    return 0;
  }

  let lo = 0;
  let hi = Math.max(1, target);
  // With a split that sums to one the final payment alone is worth `hi`, so this
  // bracket already holds; the loop only guards a split that does not.
  for (let i = 0; i < 60 && at(hi) < target; i++) {
    lo = hi;
    hi *= 2;
  }

  // A cent is well inside the €1 the caller needs, and 100 halvings of any
  // bracket reachable above get there long before the cap.
  for (let i = 0; i < 100 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

/* ── Scenarios and progress ──────────────────────────────────────────────── */

export type ScenarioName = "bear" | "base" | "bull";
export const SCENARIO_NAMES: readonly ScenarioName[] = ["bear", "base", "bull"];

export interface ScenarioOutcome {
  readonly name: ScenarioName;
  readonly rates: ScenarioRates;
  /** Month by month, through `months + extraMonths`. */
  readonly path: number[];
  /** Value at the target date with the current contribution. */
  readonly projected: number;
  readonly required: number | null;
  /** required − current: positive means pay in this much more each month. */
  readonly gap: number | null;
}

export function evaluateScenarios({
  start,
  split,
  monthlyContribution,
  months,
  target,
  scenarios,
  extraMonths = 0,
}: {
  readonly start: Buckets;
  readonly split: Split;
  readonly monthlyContribution: number;
  readonly months: number;
  readonly target: number;
  readonly scenarios: Record<ScenarioName, ScenarioRates>;
  /** Months past the target date to keep drawing, so its marker is not the chart's edge. */
  readonly extraMonths?: number;
}): ScenarioOutcome[] {
  return SCENARIO_NAMES.map((name) => {
    const rates = scenarios[name];
    const path = projectPath({
      start,
      split,
      rates,
      monthlyContribution,
      months: months + extraMonths,
    });
    const required = requiredContribution(
      { start, split, rates, months },
      target,
    );
    return {
      name,
      rates,
      path,
      projected: path[months],
      required,
      gap: required === null ? null : required - monthlyContribution,
    };
  });
}

export interface HoldingLike {
  readonly asset: { readonly type: "crypto" | "etf" | "stock" | "cash" };
  readonly current_value_eur: number;
  readonly total_invested_eur: number;
}

export interface Holdings {
  readonly crypto: { readonly value: number; readonly invested: number };
  readonly equity: { readonly value: number; readonly invested: number };
  readonly cash: { readonly value: number; readonly invested: number };
}

/** Positions folded into the rule's buckets. ETFs and stocks are both equity. */
export function bucketHoldings(positions: readonly HoldingLike[]): Holdings {
  const acc = {
    crypto: { value: 0, invested: 0 },
    equity: { value: 0, invested: 0 },
    cash: { value: 0, invested: 0 },
  };
  for (const p of positions) {
    const bucket =
      p.asset.type === "crypto"
        ? acc.crypto
        : p.asset.type === "cash"
          ? acc.cash
          : acc.equity;
    bucket.value += p.current_value_eur;
    bucket.invested += p.total_invested_eur;
  }
  return acc;
}

export interface Progress {
  readonly current: number;
  /** Cost basis of what is held: the money that went in and is still in. */
  readonly contributed: number;
  /** current − contributed: what the market has added (or taken). */
  readonly gains: number;
  /** current / target, in percent. */
  readonly pctOfTarget: number;
  /** What the projection starts from; cash only when it counts. */
  readonly start: Buckets;
}

/**
 * Where the portfolio stands against the target.
 *
 * Sideline cash sits outside the rule, so by default it neither counts toward
 * the target nor enters the projection. Counted in, it is carried at face value:
 * it earns nothing and the contributions do not go to it.
 */
export function progressTowardTarget(
  holdings: Holdings,
  target: number,
  includeCash: boolean,
): Progress {
  const cash = includeCash ? holdings.cash : { value: 0, invested: 0 };
  const current = holdings.crypto.value + holdings.equity.value + cash.value;
  const contributed =
    holdings.crypto.invested + holdings.equity.invested + cash.invested;
  return {
    current,
    contributed,
    gains: current - contributed,
    pctOfTarget: target > 0 ? (current / target) * 100 : 0,
    start: {
      crypto: holdings.crypto.value,
      equity: holdings.equity.value,
      cash: cash.value,
    },
  };
}
