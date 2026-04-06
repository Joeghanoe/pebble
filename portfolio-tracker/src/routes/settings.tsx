import { createRoute } from "@tanstack/react-router"
import { rootRoute } from "./__root"
import { Settings } from "@/frontend/screens/Settings"
import { fetchJson } from "@/lib/queryClient"
import type { GetExchangesResponse } from "@/types/api"

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["exchanges"],
      queryFn: () => fetchJson<GetExchangesResponse>("/api/exchanges"),
    })
  },
  component: Settings,
})
