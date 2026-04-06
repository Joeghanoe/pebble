import { createRoute } from "@tanstack/react-router"
import { rootRoute } from "./__root"
import { PositionDetail } from "@/frontend/screens/PositionDetail"
import { fetchJson } from "@/lib/queryClient"
import type { GetPositionsResponse, GetTransactionsResponse } from "@/types/api"

export const positionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/position/$assetId",
  loader: ({ context: { queryClient }, params: { assetId } }) => {
    const id = Number(assetId)
    void queryClient.prefetchQuery({
      queryKey: ["positions"],
      queryFn: () => fetchJson<GetPositionsResponse>("/api/positions"),
    })
    void queryClient.prefetchQuery({
      queryKey: ["transactions", id],
      queryFn: () =>
        fetchJson<GetTransactionsResponse>(`/api/transactions/${id}`),
    })
  },
  component: PositionDetail,
})
