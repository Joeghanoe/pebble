// src/lib/strategy-settings.ts
import * as React from "react";
import type { ScenarioName, ScenarioRates } from "@/lib/strategy";

/**
 * The Strategy view's inputs: the target, the contribution, and what each
 * scenario assumes the market does.
 *
 * Kept on this machine, like `preferences`, rather than in the ledger: these
 * are plans about the portfolio, not facts in it, and nothing the API computes
 * depends on them. The cost is that a second device starts from the defaults.
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
}

/** The target is due on this birthday. */
export const TARGET_AGE = 30;

export const DEFAULT_STRATEGY: StrategySettings = {
  targetAmount: 100_000,
  birthdate: null,
  monthlyContribution: 1_000,
  includeCash: false,
  scenarios: {
    bear: { crypto: -0.3, equity: 0 },
    base: { crypto: 0.15, equity: 0.06 },
    bull: { crypto: 0.5, equity: 0.1 },
  },
};

const STORAGE_KEY = "pebble.strategy";

function read(): StrategySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STRATEGY;
    }
    const stored = JSON.parse(raw) as Partial<StrategySettings>;
    // Spread per scenario as well as at the top: a scenario stored before a
    // field existed still has to arrive with every rate.
    return {
      ...DEFAULT_STRATEGY,
      ...stored,
      scenarios: {
        bear: { ...DEFAULT_STRATEGY.scenarios.bear, ...stored.scenarios?.bear },
        base: { ...DEFAULT_STRATEGY.scenarios.base, ...stored.scenarios?.base },
        bull: { ...DEFAULT_STRATEGY.scenarios.bull, ...stored.scenarios?.bull },
      },
    };
  } catch {
    return DEFAULT_STRATEGY;
  }
}

type Listener = (settings: StrategySettings) => void;

let current = typeof localStorage === "undefined" ? DEFAULT_STRATEGY : read();
const listeners = new Set<Listener>();

function write(next: StrategySettings): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the change holds for this session and no longer.
  }
  for (const listener of listeners) {
    listener(current);
  }
}

export function setStrategySetting<K extends keyof StrategySettings>(
  key: K,
  value: StrategySettings[K],
): void {
  write({ ...current, [key]: value });
}

export function setScenarioRate(
  scenario: ScenarioName,
  bucket: keyof ScenarioRates,
  value: number,
): void {
  write({
    ...current,
    scenarios: {
      ...current.scenarios,
      [scenario]: { ...current.scenarios[scenario], [bucket]: value },
    },
  });
}

export function resetStrategySettings(): void {
  write(DEFAULT_STRATEGY);
}

export function useStrategySettings(): StrategySettings {
  React.useEffect(() => {
    // Another tab edited the settings: pick them up here too.
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && event.key === STORAGE_KEY) {
        current = read();
        for (const listener of listeners) {
          listener(current);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return React.useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => DEFAULT_STRATEGY,
  );
}
