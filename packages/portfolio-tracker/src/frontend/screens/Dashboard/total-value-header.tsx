import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { GetNetWorthResponse } from "@/types/api"

function formatEur(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount).replaceAll(/\s+/g, "")
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
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

interface Props {
  totalValue: number
  totalValueBtc: number | null
  totalInvested: number
  overallPnl: number
  positionsLoading: boolean
  netWorthLoading: boolean
  chartData: GetNetWorthResponse["snapshots"]
  onRefresh: () => void
  isRefreshing: boolean
}

export function TotalValueHeader({
  totalValue,
  totalValueBtc,
  totalInvested,
  overallPnl,
  positionsLoading,
  netWorthLoading,
  chartData,
  onRefresh,
  isRefreshing,
}: Readonly<Props>) {
  const pnlEur = totalValue - totalInvested
  const totalValueBtcLabel = totalValueBtc === null ? "N/A BTC" : `${totalValueBtc.toFixed(8)} BTC`
  const lastSnapshot = chartData.at(-1)
  const lastUpdatedLabel = lastSnapshot ? formatDate(lastSnapshot.date) : "N/A"

  const getPnlColor = () => {
    if (positionsLoading) {
      return "text-muted-foreground"
    }
    if (overallPnl > 0) {
      return "text-green-500"
    }
    if (overallPnl < 0) {
      return "text-red-500"
    }
    return "text-muted-foreground"
  }

  let chartContent: React.ReactNode
  if (netWorthLoading) {
    chartContent = null
  } else if (chartData.length === 0) {
    chartContent = (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No snapshots yet
      </div>
    )
  } else {
    chartContent = (
      <ChartContainer
        config={netWorthChartConfig}
        className="aspect-auto h-28 w-full"
        initialDimension={{ width: 320, height: 200 }}
      >
        <LineChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} horizontal={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            tick={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value: string) => formatDate(value).slice(0, 5)}
          />
          <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} axisLine={false} tickLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value) => formatEur(Number(value))}
                labelFormatter={(label) => formatDate(String(label))}
              />
            }
          />
          <Line
            dataKey="total_eur"
            type="monotone"
            stroke="var(--color-total_eur)"
            fill="var(--color-total_eur)"
            fillOpacity={0.2}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="invested_eur"
            type="monotone"
            stroke="var(--color-invested_eur)"
            fill="var(--color-invested_eur)"
            fillOpacity={0.05}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    )
  }

  return (
    <div className="grid grid-cols-4 h-28">
      {/* Contains the total value of the portfolio and P&L */}
      <div className={cn("col-span-1 flex flex-col transition-opacity duration-300", positionsLoading ? "opacity-0" : "opacity-100")}>
        <h1 className="text-base text-muted-foreground mb-1">Total Worth</h1>
        <span className="text-2xl font-number">{formatEur(totalValue)}</span>
        <span className="text-xs font-number text-muted-foreground uppercase">
          {totalValueBtcLabel}
        </span>
        <div className="mt-1">
          <span className={cn(getPnlColor(), "font-number")}>{formatEur(pnlEur)}</span>
          <Badge variant="outline" className={cn("ml-2 font-number", getPnlColor())}>
            {formatPct(overallPnl)}
          </Badge>
        </div>
      </div>

      {/* Contains the chart over time (max 1y and 365d grain) */}
      <div className="col-span-2">{chartContent}</div>

      {/* Contains Sync Button (to refresh data) */}
      <div className="col-span-1 flex items-center justify-center gap-2 flex-col">
        <Button
          variant="outline"
          size="lg"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          Refresh All
        </Button>
        {/* Last updated x minutes,hours ago in that exact format */}
        <div className="ml-4 text-sm text-muted-foreground">
          {isRefreshing ? "Syncing..." : `Last updated ${lastUpdatedLabel}`}
        </div>
      </div>
    </div>
  )
}
