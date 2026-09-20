// src/hooks/use-auto-refresh.ts
import { useEffect } from "react";
import { useRefreshPrices } from "@/hooks/use-refresh-prices";
import { usePreferences } from "@/lib/preferences";

/**
 * Pulls quotes when the app is opened, when it is returned to, and on the
 * preference's interval while it stays open.
 *
 * Opening the app used to refresh nothing. The only trigger was a `setInterval`,
 * so the first pull came five minutes in — longer than most visits — and the
 * interval lived in the topbar, which remounts on every navigation, restarting
 * the countdown each time. Between those two, the button was the only thing that
 * actually fetched.
 *
 * The visibility handler is what covers a phone: the tab is not reloaded when
 * you switch back to it, so there is no mount to hang a refresh on.
 *
 * None of these carry a client-side window. They all call the un-forced refresh,
 * which the server answers from its own six-hour cooldown — one place that knows
 * when quotes were last pulled, rather than a second clock here guessing at it.
 * A pull inside that window costs one request and returns `throttled`.
 *
 * Belongs to the root layout, which outlives the routes. Mounting it twice would
 * double every attempt.
 */
export function useAutoRefresh(): void {
  const prefs = usePreferences();
  const { refreshAuto } = useRefreshPrices();

  const enabled = prefs.autoRefresh;
  const intervalMs = prefs.refreshIntervalMinutes * 60_000;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    refreshAuto();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshAuto();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const id = window.setInterval(() => refreshAuto(), intervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [enabled, intervalMs, refreshAuto]);
}
