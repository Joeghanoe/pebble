import { useEffect } from "react"
import { Calendar, DollarSign } from "lucide-react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { queryClient, fetchJson } from "@/lib/queryClient"
import { apiUrl } from "@/lib/api"
import type { GetPositionsResponse, GetNetWorthResponse } from "@/types/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SiteHeader } from "@/components/site-header"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const COOLDOWN_MS = 15 * 60 * 1000
let lastDashboardRefresh = 0

function formatEur(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

interface Props {
  onNavigate: (path: string) => void
}

const netWorthChartConfig = {
  total_eur: {
    label: "Net Worth",
    color: "var(--primary)",
  },
  invested_eur: {
    label: "Invested",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig

export function Dashboard({ onNavigate }: Readonly<Props>) {
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

  const refreshPrices = useMutation({
    mutationFn: () => fetch(apiUrl("/api/prices/refresh"), { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
      void queryClient.invalidateQueries({ queryKey: ["net-worth"] })
    },
  })

  // Auto-refresh prices + net worth on mount with 15-min cooldown
  useEffect(() => {
    if (Date.now() - lastDashboardRefresh < COOLDOWN_MS) return
    lastDashboardRefresh = Date.now()
    refreshPrices.mutate()
  }, [refreshPrices])

  const positions = positionsData?.positions ?? []
  const snapshots = netWorthData?.snapshots ?? []
  const chartData = [...snapshots]

  const totalInvested = positions.reduce(
    (sum, p) => sum + p.totalInvestedEur,
    0
  )
  const totalValue = positions.reduce((sum, p) => sum + p.currentValueEur, 0)
  const overallPnl =
    totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0
  const netWorthChartHeightClass = "h-20"

  let netWorthChartContent: React.ReactNode
  if (netWorthLoading) {
    netWorthChartContent = (
      <Skeleton className={`${netWorthChartHeightClass} w-full`} />
    )
  } else if (chartData.length === 0) {
    netWorthChartContent = (
      <div
        className={`${netWorthChartHeightClass} flex items-center justify-center text-sm text-muted-foreground`}
      >
        No snapshots yet
      </div>
    )
  } else {
    netWorthChartContent = (
      <ChartContainer
        config={netWorthChartConfig}
        className={`${netWorthChartHeightClass} w-full aspect-auto`}
        initialDimension={{ width: 320, height: 200 }}
      >
        <AreaChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value: string) => formatDate(value).slice(0, 5)}
          />
          <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value) => formatEur(Number(value))}
                labelFormatter={(label) => formatDate(String(label))}
              />
            }
          />
          <Area
            dataKey="total_eur"
            type="monotone"
            stroke="var(--color-total_eur)"
            fill="var(--color-total_eur)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Area
            dataKey="invested_eur"
            type="monotone"
            stroke="var(--color-invested_eur)"
            fill="var(--color-invested_eur)"
            fillOpacity={0.05}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    )
  }

  return (
    <>
      <SiteHeader name="Dashboard" />
      <div className="space-y-6 p-6">
        {/* Main two-column layout */}
        <div className="grid grid-cols-4 items-start gap-6">
          <Card className="h-48">
            <CardHeader className="flex items-center gap-2 px-4 font-heading">
              Total Invested
            </CardHeader>
            <CardContent className="px-4">
              <span className="text-lg font-semibold tabular-nums">
                {positionsLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  formatEur(totalInvested)
                )}
              </span>
              <p className="text-sm text-muted-foreground mt-1">
                The total amount invested across all positions.
              </p>
            </CardContent>
          </Card>

          <Card className="h-48">
            <CardHeader className="flex items-center gap-2 px-4 font-heading">
              Total Value
              <Badge>
                {positionsLoading ? (
                  <Skeleton className="h-5 w-16 rounded" />
                ) : (
                  formatPct(overallPnl)
                )}
              </Badge>
            </CardHeader>
            <CardContent className="px-4">
              <span className="text-lg font-semibold tabular-nums">
                {positionsLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  formatEur(totalValue)
                )}
              </span>
              <p className="text-sm text-muted-foreground mt-1">
                The current total value of all positions combined.
              </p>
            </CardContent>
          </Card>
            
            {/* Net worth over time in a chart */}
          <Card className="col-span-2 h-48">
            <CardHeader className="flex items-center gap-2 px-4 font-heading">
              <Calendar size={15} />
              Net Worth Over Time
            </CardHeader>
            <CardContent className="px-4 overflow-hidden">
              {netWorthChartContent}
            </CardContent>
          </Card>

          {/* ── Investment Performance table ── */}
          <Card className="py-4 col-span-3 gap-2 col-start-1">
            <CardHeader className="flex items-center gap-2 px-4 font-heading">
              <DollarSign size={15} />
              Investment Performance
            </CardHeader>
            <CardContent className="cn-item-group group/item-group flex w-full flex-col px-4 space-y-2">
              {positions.map((pos) => (
                <div
                  key={pos.asset.id}
                  data-slot="item"
                  data-variant="muted"
                  data-size="default"
                  role="button"
                  onClick={() => onNavigate(`/position/${pos.asset.id}`)}
                  className="cn-item group/item cn-item-variant-muted cn-item-size-default flex w-full flex-wrap items-center transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors gap-2 bg-accent/50 cursor-pointer rounded-lg px-3 py-2 hover:bg-accent data-[state=open]:bg-accent"
                >
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
                      className="cn-item-description [&amp;&gt;a]:underline [&amp;&gt;a]:underline-offset-4 [&amp;&gt;a:hover]:text-primary line-clamp-2 text-xs font-normal tracking-wider uppercase"
                    >
                      {pos.unitsHeld} Shares &middot; P&L: <span className={pos.pnlPct > 0 ? "text-green-600" : pos.pnlPct < 0 ? "text-red-600" : ""}>{formatPct(pos.pnlPct)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-6">
                    <span
                      data-slot="badge"
                      data-variant="outline"
                      className="cn-badge group/badge [&amp;&gt;svg]:pointer-events-none cn-badge-variant-outline inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 uppercase"
                    >
                      {/* ETF */}
                      {pos.asset.type}
                    </span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs tracking-wider text-muted-foreground uppercase">
                        Value
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatEur(pos.currentValueEur)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── Net Worth over Time table ── */}
          <Card className="py-4 col-span-1 gap-2 pb-0">
            <CardHeader className="flex items-center gap-2 px-4 font-heading">
              <Calendar size={15} />
              Net Worth over Time
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4 py-2">Date</TableHead>
                    <TableHead className="px-4 py-2 text-right">Worth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {netWorthLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-4 py-2.5">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right">
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {snapshots.length === 0 && !netWorthLoading && (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="px-4 py-6 text-center text-sm text-muted-foreground"
                      >
                        No snapshots yet
                      </TableCell>
                    </TableRow>
                  )}
                  {[...snapshots].reverse().map((s) => (
                    <TableRow key={s.date}>
                      <TableCell className="px-4 py-2.5 tabular-nums">
                        {formatDate(s.date)}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatEur(s.total_eur)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
