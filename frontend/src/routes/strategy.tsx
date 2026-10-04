import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { Strategy } from "@/frontend/screens/Strategy";
import { PositionsService, PricesService } from "@/client";
import type { GetBtcDailyResponse, GetPositionsResponse } from "@/types/api";

export const strategyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/strategy",
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["positions"],
      queryFn: () =>
        PositionsService.getPositions() as unknown as Promise<GetPositionsResponse>,
    });
    void queryClient.prefetchQuery({
      queryKey: ["btc-daily"],
      queryFn: () =>
        PricesService.getBtcDaily() as unknown as Promise<GetBtcDailyResponse>,
    });
  },
  component: Strategy,
});
