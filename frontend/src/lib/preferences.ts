// src/lib/preferences.ts
import * as React from "react";
import {
  browserStorage,
  createSyncedDocument,
  useSyncedDocument,
} from "@/lib/synced-document";
import { pushSetting, reportSyncError } from "@/lib/settings-api";

/**
 * The settings screen's display preferences.
 *
 * Stored in the API so every device the owner signs in on looks the same, and
 * cached in localStorage so the theme is right on first paint — see
 * `synced-document`. Nothing server-side reads them.
 *
 * There is no base-currency preference: Pebble prices in EUR end to end, from the
 * feed through the snapshots to every figure on screen. A currency selector here
 * would relabel those numbers, not convert them.
 *
 * There is no save button by design: every control writes on change.
 */
export interface Preferences {
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
  denominateInBtc: true,
  fullPrecision: true,
  autoRefresh: true,
  refreshIntervalMinutes: 5,
  theme: "dark",
  density: "dense",
};

/**
 * Spread over the defaults rather than trusting the stored shape: a preference
 * added in a later version has to arrive with a value.
 */
export function normalizePreferences(raw: unknown): Preferences {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULT_PREFERENCES;
  }
  return { ...DEFAULT_PREFERENCES, ...(raw as Partial<Preferences>) };
}

export const preferencesDocument = createSyncedDocument<Preferences>({
  name: "preferences",
  storageKey: "pebble.preferences",
  defaults: DEFAULT_PREFERENCES,
  normalize: normalizePreferences,
  storage: browserStorage(),
  push: (value) => pushSetting("preferences", value),
  onError: reportSyncError,
});

export function setPreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
): void {
  preferencesDocument.set({ ...preferencesDocument.get(), [key]: value });
}

export function resetPreferences(): void {
  preferencesDocument.set(DEFAULT_PREFERENCES);
}

/** Applies the theme choice to <html>, which is where the CSS variants hang. */
export function applyTheme(theme: Preferences["theme"]): void {
  document.documentElement.dataset.pbTheme = theme;
}

export function usePreferences(): Preferences {
  return useSyncedDocument(preferencesDocument, DEFAULT_PREFERENCES);
}

/** Stamps the theme on first paint, and again whenever it changes. */
export function PreferencesEffects() {
  const prefs = usePreferences();

  React.useEffect(() => {
    applyTheme(prefs.theme);
  }, [prefs.theme]);

  return null;
}
