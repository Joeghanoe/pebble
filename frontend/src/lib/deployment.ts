// src/lib/deployment.ts
//
// When the sideline cash goes to work: only when BTC has crashed. The monthly
// contribution is untouched; this adds to it. A "tranche" is a fraction of the
// monthly contribution (a quarter by default), and the further BTC sits below its
// 200-day average, the more tranches are invested from the cash that month.
//
// Nothing is skipped in a rally and nothing is ever sold: the cash waits for a
// crash, and an empty cash buffer simply means no extra that month. See ADR 0001
// for the backtest behind the defaults.
//
// Pure functions over plain numbers, like `lib/strategy`, so every rule is
// pinned by a unit test.

/** BTC at or below `belowPct` under its average invests `tranches` from the cash. */
export interface CrashStep {
  /** Percent below the average, as a positive number. */
  readonly belowPct: number;
  readonly tranches: number;
}

export interface CrashRule {
  /** The monthly contribution divided by this is one tranche. */
  readonly tranchesPerMonth: number;
  /** Where the cash is put to work. Order does not matter. */
  readonly steps: readonly CrashStep[];
}

/**
 * A quarter of the month per tranche: 1 at 10% below the 200-day EMA, 2 at 25%
 * below. Backtested on BTC 2014-2026: beat plain DCA with idle cash in 84-100% of
 * 3 to 5 year windows and never fell far behind it, but trails an even drip of the
 * same cash when no crash follows. See ADR 0001.
 */
export const DEFAULT_CRASH_RULE: CrashRule = {
  tranchesPerMonth: 4,
  steps: [
    { belowPct: 10, tranches: 1 },
    { belowPct: 25, tranches: 2 },
  ],
};

/** What has been paid in, marked by hand: Pebble places no orders. */
export interface CrashProgress {
  /** Euros taken from the sideline cash so far. */
  readonly cashUsed: number;
  /** 'YYYY-MM' of the month last marked done, so one month is not counted twice. */
  readonly markedMonth: string | null;
}

export const NO_PROGRESS: CrashProgress = {
  cashUsed: 0,
  markedMonth: null,
};

/**
 * The step the distance has reached. The deepest one wins, so 30% below picks
 * the 25% step, not the 10% one. Null in a normal month or a rally.
 */
export function stepFor(
  distancePct: number,
  steps: readonly CrashStep[],
): CrashStep | null {
  let match: CrashStep | null = null;
  for (const step of steps) {
    if (
      distancePct <= -step.belowPct &&
      (match === null || step.belowPct > match.belowPct)
    ) {
      match = step;
    }
  }
  return match;
}

export interface CrashPlan {
  /** One tranche in euros. */
  readonly trancheEur: number;
  /** The signal the step was read from; null when there is no BTC history. */
  readonly distancePct: number | null;
  /** The step in force; null when BTC is not far enough below its average. */
  readonly step: CrashStep | null;
  /** Tranches the step asks for, before the cash limits them. */
  readonly wanted: number;
  /** Tranches the cash allows: whole tranches only. */
  readonly tranches: number;
  /** Euros to invest from the cash this month. */
  readonly amount: number;
  readonly cashLeft: number;
  /** The step asked for more than the cash could pay. */
  readonly limitedByCash: boolean;
}

/**
 * This month's crash investment.
 *
 * `monthly` is the whole monthly contribution, which sizes a tranche.
 * `distancePct` is BTC's close against its moving average in percent, null when
 * there is no BTC history, which asks for nothing. `cashLeft` is the sideline
 * cash still available.
 */
export function crashPlan({
  monthly,
  rule,
  cashLeft,
  distancePct,
}: {
  readonly monthly: number;
  readonly rule: CrashRule;
  readonly cashLeft: number;
  readonly distancePct: number | null;
}): CrashPlan {
  const { tranchesPerMonth } = rule;
  if (!Number.isInteger(tranchesPerMonth) || tranchesPerMonth < 1) {
    throw new RangeError(
      `Tranches per month must be a positive whole number, got ${tranchesPerMonth}`,
    );
  }
  const trancheEur = monthly / tranchesPerMonth;
  const step = distancePct === null ? null : stepFor(distancePct, rule.steps);
  const wanted = step ? step.tranches : 0;

  const affordable =
    trancheEur > 0 ? Math.floor(Math.max(0, cashLeft) / trancheEur) : 0;
  const tranches = Math.min(wanted, affordable);
  const amount = tranches * trancheEur;
  return {
    trancheEur,
    distancePct,
    step,
    wanted,
    tranches,
    amount,
    cashLeft: cashLeft - amount,
    limitedByCash: tranches < wanted,
  };
}
