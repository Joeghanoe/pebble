import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { Dashboard } from "@/frontend/screens/Dashboard";
import { PositionsService, NetWorthService } from "@/client";
import type { GetPositionsResponse, GetNetWorthResponse } from "@/types/api";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["positions"],
      queryFn: () =>
        PositionsService.getPositionsApiPositionsGet() as unknown as Promise<GetPositionsResponse>,
    });
    // 1d backs the default 1M timeframe; 1m backs the heatmap, always.
    for (const period of ["1d", "1m"] as const) {
      void queryClient.prefetchQuery({
        queryKey: ["net-worth", period],
        queryFn: () =>
          NetWorthService.getNetWorthApiNetWorthGet({
            period,
          }) as unknown as Promise<GetNetWorthResponse>,
      });
    }
  },
  component: Dashboard,
});
