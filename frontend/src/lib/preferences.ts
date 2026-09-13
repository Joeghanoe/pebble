// src/lib/preferences.ts
import * as React from "react";

/**
 * The settings screen's state.
 *
 * These are presentation preferences — how a number is spelled, how often quotes
 * are pulled — not portfolio data, so they belong to the machine rather than to
 * the ledger and live in localStorage. Nothing here changes what the API stores.
 *
 * There is no save button by design: every control writes on change.
 */
export interface Preferences {
  /** Reserved: the API prices everything in EUR, so only EUR is selectable today. */
  baseCurrency: "EUR" | "USD" | "GBP";
  /** Show a sats value alongside every position. */
  denominateInBtc: boolean;
  /** Eight decimals on crypto quantities. */
  fullPrecision: boolean;
  /** Pull quotes while the app is open. */
  autoRefresh: boolean;
  /** How often quotes are pulled, in minutes. */
  refreshIntervalMinutes: 1 | 5 | 15;
  theme: "dark" | "midnight" | "system";
  /** Table row height. Dense is the pro-terminal default. */
  density: "dense" | "comfortable";
}

export const DEFAULT_PREFERENCES: Preferences = {
  baseCurrency: "EUR",
  denominateInBtc: true,
  fullPrecision: true,
  autoRefresh: true,
  refreshIntervalMinutes: 5,
  theme: "dark",
  density: "dense",
};

const STORAGE_KEY = "pebble.preferences";

function read(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    // Spread over the defaults rather than trusting the stored shape: a
    // preference added in a later version has to arrive with a value.
    return {
      ...DEFAULT_PREFERENCES,
      ...(JSON.parse(raw) as Partial<Preferences>),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

type Listener = (prefs: Preferences) => void;

let current =
  typeof localStorage === "undefined" ? DEFAULT_PREFERENCES : read();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener(current);
  }
}

export function setPreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A private window with storage blocked still gets a working session; the
    // choice just does not survive a reload.
  }
  emit();
}

/** Applies the theme choice to <html>, which is where the CSS variants hang. */
export function applyTheme(theme: Preferences["theme"]): void {
  document.documentElement.dataset.pbTheme = theme;
}

export function usePreferences(): Preferences {
  return React.useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => DEFAULT_PREFERENCES,
  );
}

/** Keeps a second tab in step, and stamps the theme on first paint. */
export function PreferencesEffects() {
  const prefs = usePreferences();

  React.useEffect(() => {
    applyTheme(prefs.theme);
  }, [prefs.theme]);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && event.key === STORAGE_KEY) {
        current = read();
        emit();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
