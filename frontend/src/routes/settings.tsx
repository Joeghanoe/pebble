import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { Settings } from "@/frontend/screens/Settings";
import { ExchangesService } from "@/client";
import type { GetExchangesResponse } from "@/types/api";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["exchanges"],
      queryFn: () =>
        ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
    });
  },
  component: Settings,
});
