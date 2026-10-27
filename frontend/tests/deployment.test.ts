import { describe, expect, test } from "bun:test";
import {
  crashPlan,
  DEFAULT_CRASH_RULE,
  NO_PROGRESS,
  stepFor,
} from "@/lib/deployment";
import { normalizeStrategy } from "@/lib/strategy-settings";

const rule = DEFAULT_CRASH_RULE;
const plan = (over: Partial<Parameters<typeof crashPlan>[0]> = {}) =>
  crashPlan({
    monthly: 1_000,
    rule,
    cashLeft: 4_000,
    distancePct: 0,
    ...over,
  });

describe("stepFor", () => {
  test("picks the deepest step the distance has reached", () => {
    expect(stepFor(-30, rule.steps)?.tranches).toBe(2);
    expect(stepFor(-25, rule.steps)?.tranches).toBe(2);
    expect(stepFor(-12, rule.steps)?.tranches).toBe(1);
    expect(stepFor(-10, rule.steps)?.tranches).toBe(1);
  });

  test("no step above the first threshold, in a rally, or whatever the order", () => {
    expect(stepFor(-9.9, rule.steps)).toBeNull();
    expect(stepFor(0, rule.steps)).toBeNull();
    expect(stepFor(60, rule.steps)).toBeNull();
    expect(stepFor(-30, [...rule.steps].reverse())?.tranches).toBe(2);
  });
});

describe("crashPlan", () => {
  test("a normal month and a rally ask for nothing from the cash", () => {
    for (const distancePct of [0, -9, 40, 120]) {
      const p = plan({ distancePct });
      expect(p.amount).toBe(0);
      expect(p.cashLeft).toBe(4_000);
      expect(p.limitedByCash).toBe(false);
    }
  });

  test("a tranche is the monthly contribution over the tranche count", () => {
    expect(plan().trancheEur).toBe(250);
    expect(plan({ monthly: 1_200 }).trancheEur).toBe(300);
  });

  test("a crash invests tranches from the cash, deeper means more", () => {
    const shallow = plan({ distancePct: -12 });
    expect(shallow.tranches).toBe(1);
    expect(shallow.amount).toBe(250);
    expect(shallow.cashLeft).toBe(3_750);
    const deep = plan({ distancePct: -30 });
    expect(deep.tranches).toBe(2);
    expect(deep.amount).toBe(500);
    expect(deep.cashLeft).toBe(3_500);
  });

  test("the cash limits the tranches to whole ones", () => {
    const p = plan({ distancePct: -30, cashLeft: 300 });
    expect(p.wanted).toBe(2);
    expect(p.tranches).toBe(1);
    expect(p.limitedByCash).toBe(true);
    expect(p.cashLeft).toBe(50);
  });

  test("with no cash a crash invests nothing", () => {
    const p = plan({ distancePct: -30, cashLeft: 0 });
    expect(p.tranches).toBe(0);
    expect(p.amount).toBe(0);
    expect(p.limitedByCash).toBe(true);
  });

  test("no BTC history asks for nothing", () => {
    const p = plan({ distancePct: null });
    expect(p.step).toBeNull();
    expect(p.amount).toBe(0);
  });

  test("rejects a tranche count it cannot honour", () => {
    expect(() => plan({ rule: { ...rule, tranchesPerMonth: 0 } })).toThrow(
      RangeError,
    );
  });
});

describe("strategy settings", () => {
  test("a document stored before the plan existed arrives with its defaults", () => {
    const stored = normalizeStrategy({ targetAmount: 5 });
    expect(stored.crashCash).toBe(0);
    expect(stored.crashRule).toEqual(DEFAULT_CRASH_RULE);
    expect(stored.crashProgress).toEqual(NO_PROGRESS);
  });
});
