import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  birthdayAt,
  bucketHoldings,
  CONFIRM_DAYS,
  contiguousDailyCloses,
  DEFAULT_PROFIT_RULE,
  ema,
  detectRegime,
  evaluateScenarios,
  MIN_HISTORY_DAYS,
  monthlyRate,
  monthsBetween,
  profitTakingSignal,
  progressTowardTarget,
  projectPath,
  projectValue,
  REGIME_SPLIT,
  requiredContribution,
  resolveRegime,
  sma,
  SMA_WINDOW,
  splitContribution,
  type DailyClose,
  type ProjectionInput,
  type RegimeRule,
  type RegimeState,
  type ScenarioRates,
} from "../src/lib/strategy";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const START = "2025-01-01";

function closesFrom(values: readonly number[]): DailyClose[] {
  return values.map((close, i) => ({ date: addDays(START, i), close }));
}

/**
 * 199 flat days at 100, then one close per letter: `A` far above the average,
 * `B` far below it. The average stays strictly between the two for any streak
 * shorter than the window, so each letter lands on the side it names, and the
 * first letter is the first day that has an average at all.
 */
function regimeSeries(pattern: string): DailyClose[] {
  const letters = [...pattern].map((c) => (c === "A" ? 1000 : 1));
  return closesFrom([...Array(SMA_WINDOW - 1).fill(100), ...letters]);
}

/** Date of the n-th letter (1-based) in a `regimeSeries` pattern. */
function letterDate(n: number): string {
  return addDays(START, SMA_WINDOW - 1 + n - 1);
}

const SMA_RULE: RegimeRule = {
  average: "sma",
  window: SMA_WINDOW,
  confirmDays: CONFIRM_DAYS,
};

const A = (n: number) => "A".repeat(n);
const B = (n: number) => "B".repeat(n);

const DEFAULT_SCENARIOS: Record<"bear" | "base" | "bull", ScenarioRates> = {
  bear: { crypto: -0.3, equity: 0 },
  base: { crypto: 0.15, equity: 0.06 },
  bull: { crypto: 0.5, equity: 0.1 },
};

/* ── SMA ─────────────────────────────────────────────────────────────────── */

describe("sma", () => {
  test("averages the trailing window and is null until it is full", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  test("a window of one is the series itself", () => {
    expect(sma([4, 8, 15], 1)).toEqual([4, 8, 15]);
  });

  test("a window longer than the series never fills", () => {
    expect(sma([1, 2], 3)).toEqual([null, null]);
  });

  test("the running sum agrees with a naive mean over a long series", () => {
    const values = Array.from(
      { length: 600 },
      (_, i) => 30_000 + 5_000 * Math.sin(i / 17) + i,
    );
    const fast = sma(values, SMA_WINDOW);
    for (const i of [199, 350, 599]) {
      const naive =
        values.slice(i - SMA_WINDOW + 1, i + 1).reduce((a, b) => a + b, 0) /
        SMA_WINDOW;
      expect(fast[i]).toBeCloseTo(naive, 6);
    }
  });

  test("rejects a window that is not a positive integer", () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => sma([1, 2, 3], 1.5)).toThrow(RangeError);
  });
});

/* ── Daily closes ────────────────────────────────────────────────────────── */

describe("contiguousDailyCloses", () => {
  test("carries a close across a short gap", () => {
    const run = contiguousDailyCloses([
      { date: "2026-01-01", price: 10 },
      { date: "2026-01-04", price: 13 },
    ]);
    expect(run).toEqual([
      { date: "2026-01-01", close: 10 },
      { date: "2026-01-02", close: 10 },
      { date: "2026-01-03", close: 10 },
      { date: "2026-01-04", close: 13 },
    ]);
  });

  test("keeps only what follows a gap too long to carry across", () => {
    const run = contiguousDailyCloses([
      { date: "2025-10-31", price: 1 }, // a month-end point from the backfill
      { date: "2026-01-01", price: 10 },
      { date: "2026-01-02", price: 11 },
    ]);
    expect(run.map((c) => c.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  test("sorts its input and lets a repeated date keep the later row", () => {
    const run = contiguousDailyCloses([
      { date: "2026-01-02", price: 11 },
      { date: "2026-01-01", price: 10 },
      { date: "2026-01-02", price: 12 },
    ]);
    expect(run).toEqual([
      { date: "2026-01-01", close: 10 },
      { date: "2026-01-02", close: 12 },
    ]);
  });

  test("crosses a month and a leap day without losing one", () => {
    const run = contiguousDailyCloses([
      { date: "2028-02-28", price: 1 },
      { date: "2028-03-01", price: 2 },
    ]);
    expect(run.map((c) => c.date)).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
});

/* ── Regime ──────────────────────────────────────────────────────────────── */

describe("detectRegime", () => {
  test("refuses to guess with fewer than 200 + 30 days", () => {
    const state = detectRegime(closesFrom(Array(MIN_HISTORY_DAYS - 1).fill(1)));
    expect(state).toEqual({
      status: "insufficient",
      availableDays: MIN_HISTORY_DAYS - 1,
      requiredDays: 230,
    });
  });

  test("exactly 230 days is enough to decide", () => {
    const state = detectRegime(regimeSeries(A(31)));
    expect(state.status).toBe("established");
  });

  test("29 days on one side establishes nothing", () => {
    const state = detectRegime(regimeSeries(A(29) + B(2)));
    expect(state.status).toBe("unestablished");
  });

  test("the 30th consecutive close above switches to Risk-on on that day", () => {
    const state = detectRegime(regimeSeries(A(30) + B(1)));
    expect(state).toMatchObject({
      status: "established",
      regime: "risk-on",
      since: letterDate(30),
      daysTowardSwitch: 1,
    });
  });

  test("the 30th consecutive close below switches to Defensive on that day", () => {
    const state = detectRegime(regimeSeries(A(30) + B(30)));
    expect(state).toMatchObject({
      status: "established",
      regime: "defensive",
      since: letterDate(60),
      daysTowardSwitch: 0,
    });
  });

  test("29 days against the regime is not a switch", () => {
    const state = detectRegime(regimeSeries(A(30) + B(29)));
    expect(state).toMatchObject({
      regime: "risk-on",
      since: letterDate(30),
      daysTowardSwitch: 29,
    });
    if (state.status !== "established") throw new Error("unreachable");
    expect(state.reading.side).toBe("below");
    expect(state.reading.streakDays).toBe(29);
  });

  test("one close back across the line resets the count (hysteresis)", () => {
    // 29 below, one above, 29 below: 58 days below out of 59, and still no switch.
    const state = detectRegime(regimeSeries(A(30) + B(29) + A(1) + B(29)));
    expect(state).toMatchObject({
      regime: "risk-on",
      since: letterDate(30),
      daysTowardSwitch: 29,
    });
  });

  test("a longer streak on the regime's own side does not move its start", () => {
    const state = detectRegime(regimeSeries(A(75)));
    expect(state).toMatchObject({
      regime: "risk-on",
      since: letterDate(30),
      daysTowardSwitch: 0,
    });
    if (state.status !== "established") throw new Error("unreachable");
    expect(state.reading.streakDays).toBe(75);
  });

  test("switches back and forth, dating each switch to its 30th day", () => {
    const state = detectRegime(regimeSeries(A(30) + B(30) + A(30)));
    expect(state).toMatchObject({ regime: "risk-on", since: letterDate(90) });
  });

  test("a close exactly on the average is on neither side", () => {
    const state = detectRegime(closesFrom(Array(260).fill(100)), SMA_RULE);
    expect(state.status).toBe("unestablished");
    if (state.status !== "unestablished") throw new Error("unreachable");
    expect(state.reading).toMatchObject({
      side: "on",
      streakDays: 0,
      distancePct: 0,
    });
  });

  test("reports the latest close against its average", () => {
    const state = detectRegime(regimeSeries(A(CONFIRM_DAYS + 1)), SMA_RULE);
    if (state.status !== "established") throw new Error("unreachable");
    const { reading } = state;
    // 169 flat days at 100 and 31 at 1000 in the window.
    const expected = (169 * 100 + 31 * 1000) / 200;
    expect(reading.close).toBe(1000);
    expect(reading.average).toBeCloseTo(expected, 9);
    expect(reading.distancePct).toBeCloseTo(
      ((1000 - expected) / expected) * 100,
      9,
    );
  });

  test("splits this month's contribution the spreadsheet's way", () => {
    const riskOn = splitContribution(1500, REGIME_SPLIT["risk-on"]);
    expect(riskOn.crypto).toBeCloseTo(500, 9);
    expect(riskOn.equity).toBeCloseTo(1000, 9);
    expect(splitContribution(1500, REGIME_SPLIT.defensive)).toEqual({
      crypto: 750,
      equity: 750,
    });
  });
});

/* ── Rates ───────────────────────────────────────────────────────────────── */

describe("monthlyRate", () => {
  test("compounds back to the annual rate over twelve months", () => {
    for (const annual of [-0.3, 0, 0.06, 0.15, 0.5]) {
      const m = monthlyRate(annual);
      expect(Math.pow(1 + m, 12) - 1).toBeCloseTo(annual, 12);
    }
  });

  test("is not the annual rate divided by twelve", () => {
    expect(monthlyRate(0.12)).toBeCloseTo(0.009488793, 9);
    expect(monthlyRate(0.12)).toBeLessThan(0.01);
    expect(monthlyRate(-0.3)).toBeCloseTo(-0.0292855, 6);
  });

  test("refuses a loss of 100% or more", () => {
    expect(() => monthlyRate(-1)).toThrow(RangeError);
    expect(() => monthlyRate(Number.NaN)).toThrow(RangeError);
  });
});

/* ── Projection ──────────────────────────────────────────────────────────── */

const flat: ScenarioRates = { crypto: 0, equity: 0 };

describe("projectPath", () => {
  test("with no growth it is the start plus the contributions", () => {
    const path = projectPath({
      start: { crypto: 1000, equity: 2000, cash: 500 },
      monthlyContribution: 100,
      split: REGIME_SPLIT.defensive,
      rates: flat,
      months: 3,
    });
    expect(path).toEqual([3500, 3600, 3700, 3800]);
  });

  test("each bucket compounds at its own rate", () => {
    const value = projectValue({
      start: { crypto: 1000, equity: 1000, cash: 0 },
      monthlyContribution: 0,
      split: REGIME_SPLIT.defensive,
      rates: { crypto: 0.5, equity: -0.2 },
      months: 24,
    });
    expect(value).toBeCloseTo(1000 * 1.5 ** 2 + 1000 * 0.8 ** 2, 6);
  });

  test("contributions go in at month end, split by the regime", () => {
    // One month, so the only payment has had no time to grow.
    const input: ProjectionInput = {
      start: { crypto: 0, equity: 0, cash: 0 },
      monthlyContribution: 1000,
      split: REGIME_SPLIT["risk-on"],
      rates: { crypto: 0.5, equity: 0.1 },
      months: 1,
    };
    expect(projectValue(input)).toBe(1000);
    // Two months: the first payment grows one month, per bucket.
    const two = projectValue({ ...input, months: 2 });
    expect(two).toBeCloseTo(
      (1000 / 3) * (1 + monthlyRate(0.5)) +
        (2000 / 3) * (1 + monthlyRate(0.1)) +
        1000,
      9,
    );
  });

  test("cash is carried flat and receives nothing", () => {
    const path = projectPath({
      start: { crypto: 0, equity: 0, cash: 5000 },
      monthlyContribution: 0,
      split: REGIME_SPLIT.defensive,
      rates: DEFAULT_SCENARIOS.bull,
      months: 12,
    });
    expect(path.every((v) => v === 5000)).toBe(true);
  });

  test("zero months is just today", () => {
    const path = projectPath({
      start: { crypto: 1, equity: 2, cash: 3 },
      monthlyContribution: 1000,
      split: REGIME_SPLIT.defensive,
      rates: flat,
      months: 0,
    });
    expect(path).toEqual([6]);
  });
});

/* ── Required contribution ───────────────────────────────────────────────── */

describe("requiredContribution", () => {
  const base = {
    start: { crypto: 8000, equity: 12000, cash: 0 },
    split: REGIME_SPLIT.defensive,
    months: 51,
  };

  test("reproduces the target within €1 in every default scenario and regime", () => {
    for (const rates of Object.values(DEFAULT_SCENARIOS)) {
      for (const split of Object.values(REGIME_SPLIT)) {
        const input = { ...base, split, rates };
        const required = requiredContribution(input, 100_000);
        expect(required).not.toBeNull();
        const landed = projectValue({
          ...input,
          monthlyContribution: required as number,
        });
        expect(Math.abs(landed - 100_000)).toBeLessThan(1);
      }
    }
  });

  test("matches the closed form where there is one: no growth", () => {
    const required = requiredContribution(
      { ...base, start: { crypto: 0, equity: 0, cash: 0 }, rates: flat },
      100_000,
    );
    expect(required).toBeCloseTo(100_000 / 51, 2);
  });

  test("a bear market asks for more than a bull market", () => {
    const bear = requiredContribution(
      { ...base, rates: DEFAULT_SCENARIOS.bear },
      100_000,
    ) as number;
    const bull = requiredContribution(
      { ...base, rates: DEFAULT_SCENARIOS.bull },
      100_000,
    ) as number;
    expect(bear).toBeGreaterThan(bull);
  });

  test("is zero when the target is reached without paying in", () => {
    expect(
      requiredContribution(
        {
          ...base,
          start: { crypto: 0, equity: 0, cash: 200_000 },
          rates: flat,
        },
        100_000,
      ),
    ).toBe(0);
  });

  test("is null once no months remain", () => {
    expect(
      requiredContribution({ ...base, rates: flat, months: 0 }, 100_000),
    ).toBeNull();
  });

  test("still solves when the portfolio is shrinking fast", () => {
    const input = {
      ...base,
      rates: { crypto: -0.9, equity: -0.5 },
      months: 3,
    };
    const required = requiredContribution(input, 100_000) as number;
    expect(
      Math.abs(
        projectValue({ ...input, monthlyContribution: required }) - 100_000,
      ),
    ).toBeLessThan(1);
  });
});

describe("evaluateScenarios", () => {
  test("reports projection, requirement and gap per scenario", () => {
    const outcomes = evaluateScenarios({
      start: { crypto: 10_000, equity: 10_000, cash: 0 },
      split: REGIME_SPLIT["risk-on"],
      monthlyContribution: 1000,
      months: 48,
      target: 100_000,
      scenarios: DEFAULT_SCENARIOS,
      extraMonths: 12,
    });
    expect(outcomes.map((o) => o.name)).toEqual(["bear", "base", "bull"]);
    for (const o of outcomes) {
      expect(o.path).toHaveLength(48 + 12 + 1);
      expect(o.projected).toBe(o.path[48]);
      expect(o.gap).toBeCloseTo((o.required as number) - 1000, 9);
    }
    const [bear, baseCase, bull] = outcomes;
    expect(bear.projected).toBeLessThan(baseCase.projected);
    expect(baseCase.projected).toBeLessThan(bull.projected);
  });
});

/* ── Dates ───────────────────────────────────────────────────────────────── */

describe("dates", () => {
  test("months between counts whole months only", () => {
    expect(monthsBetween("2026-09-26", "2030-06-15")).toBe(44);
    expect(monthsBetween("2026-09-15", "2030-06-15")).toBe(45);
    expect(monthsBetween("2026-09-26", "2026-09-30")).toBe(0);
    expect(monthsBetween("2031-01-01", "2030-06-15")).toBe(0);
  });

  test("adding months clamps to the end of a short month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-12-15", 1)).toBe("2028-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  test("a 30th birthday, including one on 29 February", () => {
    expect(birthdayAt("2000-06-15", 30)).toBe("2030-06-15");
    expect(birthdayAt("2000-02-29", 30)).toBe("2030-02-28");
  });
});

/* ── Progress ────────────────────────────────────────────────────────────── */

describe("progressTowardTarget", () => {
  const holdings = bucketHoldings([
    {
      asset: { type: "crypto" },
      current_value_eur: 12_000,
      total_invested_eur: 9_000,
    },
    {
      asset: { type: "etf" },
      current_value_eur: 20_000,
      total_invested_eur: 18_000,
    },
    {
      asset: { type: "stock" },
      current_value_eur: 3_000,
      total_invested_eur: 4_000,
    },
    {
      asset: { type: "cash" },
      current_value_eur: 5_000,
      total_invested_eur: 5_000,
    },
  ]);

  test("leaves sideline cash out by default", () => {
    const p = progressTowardTarget(holdings, 100_000, false);
    expect(p).toMatchObject({
      current: 35_000,
      contributed: 31_000,
      gains: 4_000,
      pctOfTarget: 35,
      start: { crypto: 12_000, equity: 23_000, cash: 0 },
    });
  });

  test("counts cash at face value when asked", () => {
    const p = progressTowardTarget(holdings, 100_000, true);
    expect(p).toMatchObject({
      current: 40_000,
      contributed: 36_000,
      gains: 4_000,
      pctOfTarget: 40,
      start: { cash: 5_000 },
    });
  });
});

/* ── EMA ─────────────────────────────────────────────────────────────────── */

describe("ema", () => {
  test("seeds with the SMA of the first window, then moves by 2 / (n + 1)", () => {
    // Window 3: α = 0.5. Seed = mean(1, 2, 3) = 2; then 2 + 0.5·(4 − 2) = 3;
    // then 3 + 0.5·(8 − 3) = 5.5.
    expect(ema([1, 2, 3, 4, 8], 3)).toEqual([null, null, 2, 3, 5.5]);
  });

  test("reacts faster than the SMA to a jump", () => {
    const values = [...Array(200).fill(100), ...Array(20).fill(200)];
    const e = ema(values, 200)[219] as number;
    const s = sma(values, 200)[219] as number;
    expect(e).toBeGreaterThan(s);
    expect(s).toBeCloseTo(110, 9);
  });

  test("needs the same history as an SMA of the same length", () => {
    const out = ema(Array(199).fill(1), 200);
    expect(out.every((v) => v === null)).toBe(true);
  });
});

/* ── Configurable rule ───────────────────────────────────────────────────── */

describe("detectRegime with a configured rule", () => {
  test("the default rule is the spreadsheet's: 200-day EMA, 30 days", () => {
    const state = detectRegime(regimeSeries(A(30) + B(1)));
    expect(state).toMatchObject({
      status: "established",
      regime: "risk-on",
      since: letterDate(30),
    });
  });

  test("the EMA and the SMA can disagree about the latest side", () => {
    // A long flat base, a 40-day spike to 300, then a dip to 150. The SMA
    // (~141) still sits under the dip; the EMA (~165) has risen past it.
    const closes = closesFrom([
      ...Array(260).fill(100),
      ...Array(40).fill(300),
      ...Array(5).fill(150),
    ]);
    const bySma = detectRegime(closes, SMA_RULE);
    const byEma = detectRegime(closes);
    if (bySma.status !== "established" || byEma.status !== "established") {
      throw new Error("unreachable");
    }
    expect(bySma.reading.side).toBe("above");
    expect(byEma.reading.side).toBe("below");
  });

  test("a shorter confirmation switches sooner", () => {
    const rule: RegimeRule = { average: "sma", window: 200, confirmDays: 10 };
    const state = detectRegime(regimeSeries(A(10) + B(1)), rule);
    expect(state).toMatchObject({ regime: "risk-on", since: letterDate(10) });
  });

  test("the history needed follows the rule's lengths", () => {
    const rule: RegimeRule = { average: "ema", window: 50, confirmDays: 5 };
    expect(detectRegime(closesFrom(Array(54).fill(1)), rule)).toMatchObject({
      status: "insufficient",
      requiredDays: 55,
    });
  });

  test("rejects a confirmation that is not a positive whole number", () => {
    expect(() =>
      detectRegime(regimeSeries(A(31)), { ...SMA_RULE, confirmDays: 0 }),
    ).toThrow(RangeError);
  });
});

describe("resolveRegime", () => {
  const riskOn = detectRegime(regimeSeries(A(31)));

  test("auto follows the rule", () => {
    expect(resolveRegime(riskOn, "auto")).toEqual({
      regime: "risk-on",
      source: "rule",
      ruleRegime: "risk-on",
    });
  });

  test("a manual regime wins, and the rule's answer is kept beside it", () => {
    expect(resolveRegime(riskOn, "defensive")).toEqual({
      regime: "defensive",
      source: "manual",
      ruleRegime: "risk-on",
    });
  });

  test("auto without an established regime has nothing to follow", () => {
    expect(resolveRegime(null, "auto").regime).toBeNull();
  });
});

/* ── Profit taking ───────────────────────────────────────────────────────── */

describe("profitTakingSignal", () => {
  // 199 flat days then n days far above: the streak is n days long.
  const aboveFor = (n: number, rule?: RegimeRule): RegimeState =>
    detectRegime(regimeSeries(A(n)), rule);
  const today = (state: RegimeState) =>
    state.status === "insufficient" ? "" : state.reading.date;

  const base = {
    btcValue: 10_000,
    totalValue: 25_000, // 40% BTC
    rule: DEFAULT_PROFIT_RULE,
    takenOn: null,
  };

  test("waits for 150 days above", () => {
    const signal = profitTakingSignal({ ...base, state: aboveFor(149) });
    expect(signal).toMatchObject({ status: "waiting", daysAbove: 149 });
  });

  test("waits while BTC is 35% of the portfolio or less", () => {
    const signal = profitTakingSignal({
      ...base,
      state: aboveFor(150),
      totalValue: 10_000 / 0.35,
    });
    expect(signal.status).toBe("waiting");
  });

  test("fires with both: sell 5% of BTC, 60/40 into S&P 500 and ex-US", () => {
    const signal = profitTakingSignal({ ...base, state: aboveFor(150) });
    expect(signal).toMatchObject({ status: "due", daysAbove: 150 });
    if (signal.status !== "due") throw new Error("unreachable");
    expect(signal.btcShare).toBeCloseTo(0.4, 9);
    expect(signal.sellEur).toBeCloseTo(500, 9);
    expect(signal.sp500Eur).toBeCloseTo(300, 9);
    expect(signal.exUsEur).toBeCloseTo(200, 9);
  });

  test("once done, stays done for the rest of the same run", () => {
    const state = aboveFor(160);
    const takenOn = addDays(today(state), -5);
    expect(profitTakingSignal({ ...base, state, takenOn })).toEqual({
      status: "done",
      takenOn,
    });
  });

  test("re-arms for a new run after a close below", () => {
    // Taken during an earlier run; since then a close below broke it and a new
    // 150-day run has formed.
    const pattern = A(30) + B(1) + A(150);
    const state = detectRegime(regimeSeries(pattern));
    const takenOn = letterDate(20); // inside the first run
    const signal = profitTakingSignal({ ...base, state, takenOn });
    expect(signal.status).toBe("due");
  });

  test("a streak older than the history still counts as the same run", () => {
    // The streak starts on the first averaged day, so the sale may predate
    // what the series can show.
    const state = aboveFor(160);
    if (state.status === "insufficient") throw new Error("unreachable");
    expect(state.reading.streakFromStart).toBe(true);
    const signal = profitTakingSignal({
      ...base,
      state,
      takenOn: "2020-01-01",
    });
    expect(signal.status).toBe("done");
  });

  test("says nothing without enough history", () => {
    const state = detectRegime(closesFrom([1, 2, 3]));
    expect(profitTakingSignal({ ...base, state }).status).toBe("unavailable");
  });
});
