// src/hooks/use-refresh-prices.ts
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RefreshPricesResponse } from "@/types/api";

const COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Explicit (manual) price refresh, with a client-side cooldown on top of the
 * API's own throttle. Pass `assetId` for a per-asset cooldown, omit it for the
 * global one.
 *
 * `refreshNow` skips the cooldown: it is for the settings-driven auto-refresh,
 * whose interval is the user's stated cadence. The API still throttles, so the
 * worst case is a wasted round trip rather than a rate-limit ban upstream.
 */
export function useRefreshPrices(assetId?: number) {
  const queryClient = useQueryClient();
  const lastRefreshAtRef = useRef<Map<number, number>>(new Map());
  const [isCoolingDown, setIsCoolingDown] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.refreshPrices(),
    onSuccess: (response: RefreshPricesResponse) => {
      if (response.throttled) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      void queryClient.invalidateQueries({ queryKey: ["position-history"] });
    },
  });

  const refreshNow = useCallback(() => {
    lastRefreshAtRef.current.set(assetId ?? 0, Date.now());
    setIsCoolingDown(true);
    mutation.mutate();
  }, [assetId, mutation]);

  const refresh = useCallback(() => {
    const key = assetId ?? 0;
    const last = lastRefreshAtRef.current.get(key) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      setIsCoolingDown(true);
      return;
    }
    refreshNow();
  }, [assetId, refreshNow]);

  return {
    refresh,
    refreshNow,
    isPending: mutation.isPending,
    isCoolingDown,
  };
}
