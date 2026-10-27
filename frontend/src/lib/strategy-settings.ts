// src/lib/strategy-settings.ts
import {
  browserStorage,
  createSyncedDocument,
  useSyncedDocument,
} from "@/lib/synced-document";
import { pushSetting, reportSyncError } from "@/lib/settings-api";
import {
  DEFAULT_CRASH_RULE,
  NO_PROGRESS,
  type CrashProgress,
  type CrashRule,
  type CrashStep,
} from "@/lib/deployment";
import {
  DEFAULT_PROFIT_RULE,
  DEFAULT_RULE,
  REGIME_SPLIT,
  type ProfitRule,
  type Regime,
  type RegimeMode,
  type RegimeRule,
  type ScenarioName,
  type ScenarioRates,
  type Split,
} from "@/lib/strategy";

/**
 * The Strategy view's inputs: the rule itself (its lengths, its splits, and
 * whether to follow it at all), the target, the contribution, and what each
 * scenario assumes the market does.
 *
 * Stored in the API as one opaque document, like `preferences`, so every
 * device plans against the same target and rule. The API never reads it: these
 * are plans about the portfolio, not facts in it, and nothing it computes
 * depends on them.
 *
 * Rates are stored as fractions (0.15 is 15%/yr); the settings screen shows
 * and edits them as percentages.
 */
export interface StrategySettings {
  targetAmount: number;
  /** 'YYYY-MM-DD'. The target date is the birthday at `TARGET_AGE`. Null until set. */
  birthdate: string | null;
  monthlyContribution: number;
  /** Count the sideline cash buffer toward the target. It is outside the rule. */
  includeCash: boolean;
  scenarios: Record<ScenarioName, ScenarioRates>;
  /** The SMA length and the confirmation streak the regime rule uses. */
  rule: RegimeRule;
  /** How each regime splits the contribution. Crypto and equity sum to one. */
  splits: Record<Regime, Split>;
  /** "auto" follows the rule; a regime name holds that regime by hand. */
  regimeMode: RegimeMode;
  profitRule: ProfitRule;
  /** The day a profit-taking sale was marked done; it covers that run above the average. */
  profitTakenOn: string | null;
  /** Euros of sideline cash held back for a BTC crash. */
  crashCash: number;
  crashRule: CrashRule;
  /** What has been drawn from the cash so far; marked by hand. */
  crashProgress: CrashProgress;
}

/** The target is due on this birthday. */
export const TARGET_AGE = 30;

export const DEFAULT_STRATEGY: StrategySettings = {
  targetAmount: 100_000,
  birthdate: null,
  monthlyContribution: 1_500,
  includeCash: false,
  scenarios: {
    bear: { crypto: -0.3, equity: 0 },
    base: { crypto: 0.15, equity: 0.06 },
    bull: { crypto: 0.5, equity: 0.1 },
  },
  rule: DEFAULT_RULE,
  splits: REGIME_SPLIT,
  regimeMode: "auto",
  profitRule: DEFAULT_PROFIT_RULE,
  profitTakenOn: null,
  crashCash: 0,
  crashRule: DEFAULT_CRASH_RULE,
  crashProgress: NO_PROGRESS,
};

/**
 * Spread per scenario, rule and split as well as at the top: a document stored
 * before a field existed still has to arrive with every value.
 */
export function normalizeStrategy(raw: unknown): StrategySettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULT_STRATEGY;
  }
  const stored = raw as Partial<StrategySettings>;
  return {
    ...DEFAULT_STRATEGY,
    ...stored,
    scenarios: {
      bear: { ...DEFAULT_STRATEGY.scenarios.bear, ...stored.scenarios?.bear },
      base: { ...DEFAULT_STRATEGY.scenarios.base, ...stored.scenarios?.base },
      bull: { ...DEFAULT_STRATEGY.scenarios.bull, ...stored.scenarios?.bull },
    },
    rule: { ...DEFAULT_STRATEGY.rule, ...stored.rule },
    profitRule: { ...DEFAULT_STRATEGY.profitRule, ...stored.profitRule },
    crashRule: { ...DEFAULT_STRATEGY.crashRule, ...stored.crashRule },
    crashProgress: {
      ...DEFAULT_STRATEGY.crashProgress,
      ...stored.crashProgress,
    },
    splits: {
      defensive: {
        ...DEFAULT_STRATEGY.splits.defensive,
        ...stored.splits?.defensive,
      },
      "risk-on": {
        ...DEFAULT_STRATEGY.splits["risk-on"],
        ...stored.splits?.["risk-on"],
      },
    },
  };
}

export const strategyDocument = createSyncedDocument<StrategySettings>({
  name: "strategy",
  storageKey: "pebble.strategy",
  defaults: DEFAULT_STRATEGY,
  normalize: normalizeStrategy,
  storage: browserStorage(),
  push: (value) => pushSetting("strategy", value),
  onError: reportSyncError,
});

function write(next: StrategySettings): void {
  strategyDocument.set(next);
}

function current(): StrategySettings {
  return strategyDocument.get();
}

export function setStrategySetting<K extends keyof StrategySettings>(
  key: K,
  value: StrategySettings[K],
): void {
  write({ ...current(), [key]: value });
}

export function setScenarioRate(
  scenario: ScenarioName,
  bucket: keyof ScenarioRates,
  value: number,
): void {
  const settings = current();
  write({
    ...settings,
    scenarios: {
      ...settings.scenarios,
      [scenario]: { ...settings.scenarios[scenario], [bucket]: value },
    },
  });
}

export function setRule<K extends keyof RegimeRule>(
  key: K,
  value: RegimeRule[K],
): void {
  const settings = current();
  write({ ...settings, rule: { ...settings.rule, [key]: value } });
}

export function setProfitRule(key: keyof ProfitRule, value: number): void {
  const settings = current();
  write({ ...settings, profitRule: { ...settings.profitRule, [key]: value } });
}

export function setTranchesPerMonth(tranchesPerMonth: number): void {
  const { crashRule } = current();
  setStrategySetting("crashRule", { ...crashRule, tranchesPerMonth });
}

export function setCrashStep(
  index: number,
  key: keyof CrashStep,
  value: number,
): void {
  const { crashRule } = current();
  setStrategySetting("crashRule", {
    ...crashRule,
    steps: crashRule.steps.map((step, i) =>
      i === index ? { ...step, [key]: value } : step,
    ),
  });
}

/** Marks this month's crash money as paid in: `amount` euros out of the cash. */
export function markCrash(amount: number, month: string): void {
  const { crashProgress } = current();
  setStrategySetting("crashProgress", {
    cashUsed: crashProgress.cashUsed + amount,
    markedMonth: month,
  });
}

/** Puts the cash back to what was entered and clears the month marked. */
export function restartCrash(): void {
  setStrategySetting("crashProgress", NO_PROGRESS);
}

/** Sets a regime's crypto share; equity takes the rest, so the two always sum to one. */
export function setRegimeCryptoShare(regime: Regime, crypto: number): void {
  const settings = current();
  write({
    ...settings,
    splits: { ...settings.splits, [regime]: { crypto, equity: 1 - crypto } },
  });
}

export function resetStrategySettings(): void {
  write(DEFAULT_STRATEGY);
}

export function useStrategySettings(): StrategySettings {
  return useSyncedDocument(strategyDocument, DEFAULT_STRATEGY);
}
