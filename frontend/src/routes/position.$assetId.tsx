import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { PositionDetail } from "@/frontend/screens/PositionDetail";
import { PositionsService, TransactionsService } from "@/client";
import type {
  GetPositionHistoryResponse,
  GetPositionsResponse,
  GetTransactionsResponse,
} from "@/types/api";

export const positionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/position/$assetId",
  loader: ({ context: { queryClient }, params: { assetId } }) => {
    const id = Number(assetId);
    void queryClient.prefetchQuery({
      queryKey: ["positions"],
      queryFn: () =>
        PositionsService.getPositionsApiPositionsGet() as unknown as Promise<GetPositionsResponse>,
    });
    void queryClient.prefetchQuery({
      queryKey: ["position-history", id, "1d"],
      queryFn: () =>
        PositionsService.getPositionHistoryApiPositionsAssetIdHistoryGet({
          assetId: id,
          period: "1d",
        }) as unknown as Promise<GetPositionHistoryResponse>,
    });
    void queryClient.prefetchQuery({
      queryKey: ["transactions", id],
      queryFn: () =>
        TransactionsService.listTransactionsApiTransactionsAssetIdGet({
          assetId: id,
        }) as unknown as Promise<GetTransactionsResponse>,
    });
  },
  component: PositionDetail,
});
