// src/lib/settings-sync.ts
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSettings } from "@/lib/settings-api";
import type { SyncStatus } from "@/lib/synced-document";
import { preferencesDocument } from "@/lib/preferences";
import { strategyDocument } from "@/lib/strategy-settings";

export const SETTINGS_QUERY_KEY = ["settings"] as const;

/**
 * Pulls the server's settings into the local stores, on load and whenever the
 * window regains focus — which is when an edit made on another device becomes
 * visible here. Mounted once, inside the access gate, so it never asks before
 * the owner is known.
 */
export function SettingsSync() {
  const { data } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  React.useEffect(() => {
    if (!data) {
      return;
    }
    preferencesDocument.hydrate(data.preferences ?? null);
    strategyDocument.hydrate(data.strategy ?? null);
  }, [data]);

  React.useEffect(() => {
    // Keep a second tab in step with this one's edits.
    const onStorage = (event: StorageEvent) => {
      for (const document of [preferencesDocument, strategyDocument]) {
        if (event.key === document.storageKey) {
          document.reloadFromStorage();
        }
      }
    };
    // Send a debounced edit before the page goes away rather than on the next load.
    const onHide = () => {
      void preferencesDocument.flush();
      void strategyDocument.flush();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return null;
}

/** The worse of the two documents' states, for the settings page's save indicator. */
export function useSettingsSyncStatus(): SyncStatus {
  const subscribe = React.useCallback((onChange: () => void) => {
    const offPrefs = preferencesDocument.subscribe(onChange);
    const offStrategy = strategyDocument.subscribe(onChange);
    return () => {
      offPrefs();
      offStrategy();
    };
  }, []);
  const combined = () => {
    const states = [preferencesDocument.status(), strategyDocument.status()];
    return states.includes("error")
      ? "error"
      : states.includes("saving")
        ? "saving"
        : "idle";
  };
  return React.useSyncExternalStore(subscribe, combined, () => "idle");
}
