import { createRoute } from "@tanstack/react-router"
import { rootRoute } from "./__root"
import { Dashboard } from "@/frontend/screens/Dashboard"
import { PositionsService, NetWorthService } from "@/client"
import type { GetPositionsResponse, GetNetWorthResponse } from "@/types/api"

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["positions"],
      queryFn: () => PositionsService.getPositionsApiPositionsGet() as unknown as Promise<GetPositionsResponse>,
    })
    void queryClient.prefetchQuery({
      queryKey: ["net-worth"],
      queryFn: () => NetWorthService.getNetWorthApiNetWorthGet() as unknown as Promise<GetNetWorthResponse>,
    })
  },
  component: Dashboard,
})
