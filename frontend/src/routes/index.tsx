import { createRoute } from "@tanstack/react-router"
import { rootRoute } from "./__root"
import { Dashboard } from "@/frontend/screens/Dashboard"
import { fetchJson } from "@/lib/queryClient"
import type { GetPositionsResponse, GetNetWorthResponse } from "@/types/api"

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["positions"],
      queryFn: () => fetchJson<GetPositionsResponse>("/api/positions"),
    })
    void queryClient.prefetchQuery({
      queryKey: ["net-worth"],
      queryFn: () => fetchJson<GetNetWorthResponse>("/api/net-worth"),
    })
  },
  component: Dashboard,
})
