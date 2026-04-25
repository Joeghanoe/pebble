// src/hooks/use-refresh-prices.ts
import { useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { RefreshPricesResponse } from "@/types/api"

const COOLDOWN_MS = 15 * 60 * 1000

/**
 * Manages explicit (manual) price refresh with a per-key cooldown.
 * Pass `assetId` for per-asset cooldown (PositionDetail).
 * Omit `assetId` for a global single-key cooldown (Dashboard).
 */
export function useRefreshPrices(assetId?: number) {
  const queryClient = useQueryClient()
  // The map key is assetId when provided, or 0 for the global case
  const lastRefreshAtRef = useRef<Map<number, number>>(new Map())

  const mutation = useMutation({
    mutationFn: () => api.refreshPrices(),
    onSuccess: (response: RefreshPricesResponse) => {
      if (response.throttled) {
        return
      }
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
      void queryClient.invalidateQueries({ queryKey: ["net-worth"] })
    },
  })

  function refresh() {
    const key = assetId ?? 0
    const last = lastRefreshAtRef.current.get(key) ?? 0

    if (Date.now() - last < COOLDOWN_MS) {
      return
    }

    lastRefreshAtRef.current.set(key, Date.now())
    mutation.mutate()
  }

  return {
    refresh,
    isPending: mutation.isPending,
  }
}
