// src/hooks/use-refresh-prices.ts
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RefreshPricesResponse } from "@/types/api";

/**
 * Pulls fresh quotes.
 *
 * Two callers with different rights. `refresh` is the button: somebody is
 * watching the spinner, so it forces, and the server honours it. `refreshAuto`
 * is the background interval, which the server throttles to a few times a day —
 * quotes here are daily-resolution, so polling harder only burns rate limit.
 *
 * There is deliberately no client-side cooldown. The old one guessed at the
 * server's window and got it wrong, so the button would refuse to do anything
 * while the prices on screen were hours stale.
 */
export const REFRESH_MUTATION_KEY = ["refresh-prices"] as const;

export function useRefreshPrices() {
  const queryClient = useQueryClient();
  const [throttledUntil, setThrottledUntil] = useState<string | null>(null);

  const mutation = useMutation({
    // Keyed so the topbar can spin its button for any pull, including the ones
    // the root layout starts on its own — otherwise the app looks idle while it
    // is in fact fetching.
    mutationKey: REFRESH_MUTATION_KEY,
    mutationFn: (force: boolean) => api.refreshPrices(force),
    onSuccess: (response: RefreshPricesResponse) => {
      if (response.throttled) {
        setThrottledUntil(response.next_allowed_at ?? null);
        return;
      }
      setThrottledUntil(null);
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      void queryClient.invalidateQueries({ queryKey: ["position-history"] });
    },
  });

  const { mutate } = mutation;
  const refresh = useCallback(() => mutate(true), [mutate]);
  const refreshAuto = useCallback(() => mutate(false), [mutate]);

  return {
    refresh,
    refreshAuto,
    isPending: mutation.isPending,
    throttledUntil,
  };
}
