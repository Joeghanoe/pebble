import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  birthdayAt,
  bucketHoldings,
  CONFIRM_DAYS,
  contiguousDailyCloses,
  detectRegime,
  evaluateScenarios,
  MIN_HISTORY_DAYS,
  monthlyRate,
  monthsBetween,
  progressTowardTarget,
  projectPath,
  projectValue,
  REGIME_SPLIT,
  requiredContribution,
  sma,
  SMA_WINDOW,
  splitContribution,
  type DailyClose,
  type ProjectionInput,
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
    const state = detectRegime(closesFrom(Array(260).fill(100)));
    expect(state.status).toBe("unestablished");
    if (state.status !== "unestablished") throw new Error("unreachable");
    expect(state.reading).toMatchObject({
      side: "on",
      streakDays: 0,
      distancePct: 0,
    });
  });

  test("reports the latest close against its average", () => {
    const state = detectRegime(regimeSeries(A(CONFIRM_DAYS + 1)));
    if (state.status !== "established") throw new Error("unreachable");
    const { reading } = state;
    // 169 flat days at 100 and 31 at 1000 in the window.
    const expected = (169 * 100 + 31 * 1000) / 200;
    expect(reading.close).toBe(1000);
    expect(reading.sma).toBeCloseTo(expected, 9);
    expect(reading.distancePct).toBeCloseTo(
      ((1000 - expected) / expected) * 100,
      9,
    );
  });

  test("splits this month's contribution by the regime", () => {
    expect(splitContribution(1000, REGIME_SPLIT.defensive)).toEqual({
      crypto: 500,
      equity: 500,
    });
    expect(splitContribution(1000, REGIME_SPLIT["risk-on"])).toEqual({
      crypto: 250,
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
      250 * (1 + monthlyRate(0.5)) + 750 * (1 + monthlyRate(0.1)) + 1000,
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
