import { cn } from "@/lib/utils"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { fetchJson } from "@/lib/queryClient"
import { formatEur, formatPct } from "@/lib/format"
import { useRefreshPrices } from "@/hooks/use-refresh-prices"
import type { GetPositionsResponse, GetNetWorthResponse } from "@/types/api"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SiteHeader } from "@/components/site-header"
import { TotalValueHeader } from "./total-value-header"

export function Dashboard() {
  const { refresh: refreshPrices, isPending: isRefreshing } = useRefreshPrices()

  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: () => fetchJson<GetPositionsResponse>("/api/positions"),
    // Sort positions by current value descending
    select: (data: GetPositionsResponse) => ({
      positions: [...data.positions].sort(
        (a, b) => b.currentValueEur - a.currentValueEur
      ),
    }),
  })

  const { data: netWorthData, isLoading: netWorthLoading } = useQuery({
    queryKey: ["net-worth"],
    queryFn: () => fetchJson<GetNetWorthResponse>("/api/net-worth"),
  })

  const positions = positionsData?.positions ?? []
  const snapshots = netWorthData?.snapshots ?? []

  const totalInvested = positions.reduce(
    (sum, p) => sum + p.totalInvestedEur,
    0
  )
  const totalValue = positions.reduce((sum, p) => sum + p.currentValueEur, 0)
  const overallPnl =
    totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0

  return (
    <>
      <SiteHeader name="Dashboard" />
      <div className={cn("space-y-2 p-6 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card transition-opacity duration-500", positionsLoading || netWorthLoading ? "opacity-0" : "opacity-100")}>
        <TotalValueHeader
          totalValue={totalValue}
          totalInvested={totalInvested}
          overallPnl={overallPnl}
          positionsLoading={positionsLoading}
          netWorthLoading={netWorthLoading}
          chartData={snapshots}
          onRefresh={refreshPrices}
          isRefreshing={isRefreshing}
        />

        {/* Main two-column layout */}
        <div className="grid grid-cols-4 items-start gap-6">
          {/* ── Investment Performance table ── */}
          <Card className="col-span-4 col-start-1 gap-3 py-4">
            <CardHeader className="flex items-center gap-2 px-4 font-heading text-xl">
              Assets
            </CardHeader>
            <CardContent className="cn-item-group group/item-group flex w-full flex-col space-y-2 px-4">
              {positions.map((pos) => (
                <Link to={`/position/${pos.asset.id}`} key={pos.asset.id} className="cn-item group/item cn-item-variant-muted cn-item-size-default flex w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg bg-accent/50 px-3 py-2 transition-colors duration-100 outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent [a]:transition-colors" preload="intent">
                  <div
                    data-slot="item-media"
                    data-variant="default"
                    className="cn-item-media [&amp;_svg]:pointer-events-none cn-item-media-variant-default flex shrink-0 items-center justify-center"
                  >
                    <div className="flex size-12 items-center justify-center rounded-lg border text-sm font-semibold">
                      {pos.asset.symbol.slice(0, 3)}
                    </div>
                  </div>
                  <div
                    data-slot="item-content"
                    className="cn-item-content [&amp;+[data-slot=item-content]]:flex-none flex flex-1 flex-col"
                  >
                    <div
                      data-slot="item-title"
                      className="cn-item-title cn-font-heading line-clamp-1 flex w-fit items-center"
                    >
                      {pos.asset.name}
                    </div>
                    <p
                      data-slot="item-description"
                      className="cn-item-description [&amp;&gt;a]:underline [&amp;&gt;a]:underline-offset-4 [&amp;&gt;a:hover]:text-primary line-clamp-2 text-xs font-normal tracking-wider uppercase font-number"
                    >
                      {pos.unitsHeld} Shares &middot; P&L:{" "}
                      <span
                        className={
                          pos.pnlPct > 0
                            ? "text-green-600"
                            : pos.pnlPct < 0
                              ? "text-red-600"
                              : ""
                        }
                      >
                        {formatPct(pos.pnlPct)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-6">
                    <span
                      data-slot="badge"
                      data-variant="outline"
                      className="cn-badge group/badge [&amp;&gt;svg]:pointer-events-none cn-badge-variant-outline inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap uppercase focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
                    >
                      {pos.asset.type}
                    </span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs tracking-wider text-muted-foreground uppercase">
                        Value
                      </span>
                      <span className="font-medium tabular-nums font-number">
                        {formatEur(pos.currentValueEur)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
