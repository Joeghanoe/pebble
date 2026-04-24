import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import { ArrowLeft, RefreshCw, X } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { fetchJson } from "@/lib/queryClient"
import { api } from "@/lib/api"
import {
  formatEur,
  formatEurPrice,
  formatUsdPrice,
  formatPct,
  formatUnits,
} from "@/lib/format"
import { useRefreshPrices } from "@/hooks/use-refresh-prices"
import {
  enrichTransactions,
  getOpenBuyTransactions,
  buildPnlChartData,
  buildValueChartData,
  buildFrequencyData,
  calcPositionTotals,
  type EnrichedTransaction,
} from "@/lib/position-analytics"
import { AddTransactionModal } from "@/frontend/components/AddTransactionModal"
import { EditPositionModal } from "@/frontend/components/EditPositionModal"
import type {
  GetPositionsResponse,
  GetTransactionsResponse,
  GetExchangesResponse,
} from "@/types/api"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SiteHeader } from "@/components/site-header"
import { cn } from "@/lib/utils"

const pnlChartConfig = {
  pnl: { label: "P&L", color: "var(--primary)" },
} satisfies ChartConfig

const valueChartConfig = {
  value: { label: "Value", color: "var(--primary)" },
} satisfies ChartConfig

const frequencyChartConfig = {
  timestamp: { label: "Date", color: "var(--primary)" },
} satisfies ChartConfig

export function PositionDetail() {
  const { assetId: assetIdStr } = useParams({ strict: false })
  const assetId = Number(assetIdStr ?? "0")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refresh: handleRefreshPrice } = useRefreshPrices(assetId)

  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: () => fetchJson<GetPositionsResponse>("/api/positions"),
  })

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", assetId],
    queryFn: () =>
      fetchJson<GetTransactionsResponse>(`/api/transactions/${assetId}`),
  })

  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () => fetchJson<GetExchangesResponse>("/api/exchanges"),
  })

  const deleteTx = useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["transactions", assetId],
      })
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
    },
  })

  const exchanges = exchangesData?.exchanges ?? []
  const position = positionsData?.positions.find((p) => p.asset.id === assetId)
  const transactions = txData?.transactions ?? []

  async function handleDeleteTx(id: number) {
    if (!confirm("Delete this transaction?")) return
    deleteTx.mutate(id)
  }

  const symbol = position?.asset.symbol ?? "…"
  const unitsHeld = position?.unitsHeld ?? 0
  const totalInvested = position?.totalInvestedEur ?? 0
  const currentValue = position?.currentValueEur ?? 0
  const pnlEur = currentValue - totalInvested
  const pnlPct = position?.pnlPct ?? 0

  const priceResult = position?.priceResult
  const priceEur =
    priceResult && priceResult.status !== "unavailable"
      ? priceResult.priceEur
      : null
  const priceUsd =
    priceResult &&
    priceResult.status !== "unavailable" &&
    priceResult.exchangeRate
      ? priceResult.priceEur * priceResult.exchangeRate
      : null

  const enrichedTx = enrichTransactions(transactions, priceEur)
  const buyTxs = enrichedTx.filter((t) => t.type === "buy")
  const totalSoldUnits = transactions
    .filter((t) => t.type === "sell")
    .reduce((s, t) => s + t.units, 0)
  const openBuyTxs = getOpenBuyTransactions(enrichedTx, totalSoldUnits)
  const closedBuyIds = new Set(
    enrichedTx
      .filter((t) => t.type === "buy" && !openBuyTxs.some((o) => o.id === t.id))
      .map((t) => t.id)
  )
  const pnlChartData = buildPnlChartData(openBuyTxs)
  const valueChartData = buildValueChartData(openBuyTxs)
  const frequencyData = buildFrequencyData(buyTxs)
  const { totalUnits, totalPaid, totalCurrentVal, totalPct } =
    calcPositionTotals(transactions, priceEur)

  if (!position && !positionsLoading) {
    return (
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void navigate({ to: "/" })}
        >
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <p className="mt-4 text-muted-foreground">Position not found</p>
      </div>
    )
  }

  const pnlBadgeClass = (pct: number) => {
    if (pct > 0) {
      return "bg-green-500/15 text-green-500 border-transparent"
    } else if (pct < 0) {
      return "bg-destructive/15 text-destructive border-transparent"
    } else {
      return "bg-muted text-muted-foreground border-transparent"
    }
  }

  return (
    <>
      <SiteHeader name={symbol}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: "/" })}
        >
          <ArrowLeft size={14} className="mr-1" />
        </Button>
        {position && (
          <EditPositionModal asset={position.asset} exchanges={exchanges} />
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          onClick={handleRefreshPrice}
          title="Refresh price"
        >
          <RefreshCw size={13} />
        </Button>
        <AddTransactionModal
          assetId={assetId}
          trigger={
            <Button variant="outline" size="sm">
              + Add Transaction
            </Button>
          }
        />
      </SiteHeader>

      <div
        className={cn(
          "flex flex-col gap-4 p-6 transition-opacity duration-500",
          positionsLoading || txLoading ? "opacity-0" : "opacity-100"
        )}
      >
        {/* Position header — mirrors TotalValueHeader layout */}
        <div className="grid grid-cols-4 items-start gap-6">
          {/* Key metrics */}
          <div className="col-span-1 flex flex-col gap-1">
            <h1 className="text-base text-muted-foreground">Current Value</h1>
            <span className="font-number text-4xl">
              {positionsLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                formatEur(currentValue)
              )}
            </span>
            <div>
              <span
                className={
                  positionsLoading
                    ? "font-number text-muted-foreground"
                    : pnlEur >= 0
                      ? "font-number text-green-500"
                      : "font-number text-destructive"
                }
              >
                {positionsLoading ? (
                  <Skeleton className="h-4 w-20" />
                ) : (
                  formatEur(pnlEur)
                )}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "ml-2 font-number",
                  positionsLoading
                    ? "text-muted-foreground"
                    : pnlPct >= 0
                      ? "text-green-500"
                      : "text-destructive"
                )}
              >
                {positionsLoading ? (
                  <Skeleton className="h-5 w-16 rounded" />
                ) : (
                  formatPct(pnlPct)
                )}
              </Badge>
            </div>
          </div>

          {/* Sparkline — only rendered when there's data (grid adjusts automatically) */}
          <div
            className={cn(
              "col-span-2",
              valueChartData.length <= 1 && "opacity-0"
            )}
          >
            <ChartContainer
              config={valueChartConfig}
              className="aspect-auto h-32 w-full"
              initialDimension={{ width: 320, height: 112 }}
            >
              <LineChart
                data={valueChartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} horizontal={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tick={false}
                  axisLine={false}
                />
                <YAxis
                  hide
                  domain={["dataMin - 10", "dataMax + 10"]}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(v) => formatEur(Number(v))}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </div>

          {/* Secondary stats */}
          <div className="col-span-1 flex flex-col gap-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs tracking-wider text-muted-foreground uppercase">
                Holdings
              </span>
              <span className="font-number font-medium tabular-nums">
                {positionsLoading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  `${formatUnits(unitsHeld)} ${symbol}`
                )}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs tracking-wider text-muted-foreground uppercase">
                Invested
              </span>
              <span className="font-number font-medium tabular-nums">
                {positionsLoading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  formatEur(totalInvested)
                )}
              </span>
            </div>
            {priceEur !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tracking-wider text-muted-foreground uppercase">
                  Price
                </span>
                <span className="font-number font-medium text-primary tabular-nums">
                  {formatEurPrice(priceEur)}
                  {priceUsd !== null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatUsdPrice(priceUsd)}
                    </span>
                  )}
                </span>
              </div>
            )}
            {priceResult?.status === "stale" && (
              <p className="text-xs text-muted-foreground">
                Last known: {priceResult.lastKnownDate}
              </p>
            )}
          </div>
        </div>

        {/* Optional charts row */}
        {(pnlChartData.length > 1 || frequencyData.length > 1) && (
          <div
            className={cn(
              "grid gap-4",
              pnlChartData.length > 1 && frequencyData.length > 1
                ? "grid-cols-2"
                : "grid-cols-1"
            )}
          >
            {pnlChartData.length > 1 && (
              <Card className="gap-3 py-4">
                <CardHeader className="flex items-center gap-2 px-4 font-heading text-xl">
                  Profit and Loss Overview
                </CardHeader>
                <CardContent className="px-4 pt-0">
                  <ChartContainer
                    config={pnlChartConfig}
                    className="aspect-auto h-40 w-full"
                    initialDimension={{ width: 320, height: 160 }}
                  >
                    <LineChart
                      data={pnlChartData}
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid vertical={false} horizontal={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            formatter={(v) => `${Number(v).toFixed(2)}%`}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="var(--color-pnl)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
            {frequencyData.length > 1 && (
              <Card className="gap-3 py-4">
                <CardHeader className="flex items-center gap-2 px-4 font-heading text-xl">
                  Investing Frequency
                </CardHeader>
                <CardContent className="px-4 pt-0">
                  <ChartContainer
                    config={frequencyChartConfig}
                    className="aspect-auto h-40 w-full"
                    initialDimension={{ width: 320, height: 160 }}
                  >
                    <LineChart
                      data={frequencyData}
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid vertical={false} horizontal={false} />
                      <XAxis
                        dataKey="index"
                        type="number"
                        tick={{ fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        dataKey="timestamp"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        tickFormatter={(v: number) => {
                          const d = new Date(v)
                          return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
                        }}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={({ payload }) => {
                          const item = payload?.[0]?.payload as
                            | { date: string; index: number }
                            | undefined
                          if (!item) return null
                          return (
                            <div className="rounded border border-border bg-card p-2 text-xs shadow">
                              #{item.index} — {item.date}
                            </div>
                          )
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="timestamp"
                        stroke="var(--color-timestamp)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "var(--color-timestamp)" }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Transaction Log */}
        <Card className="gap-3 overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-2 whitespace-nowrap">
                    Date
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    Amount
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    Paid (€)
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    Current Value (€)
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    Profit/Loss
                  </TableHead>
                  <TableHead className="w-8 px-3 py-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {txLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Skeleton className="ml-auto h-5 w-14 rounded" />
                      </TableCell>
                      <TableCell className="px-3 py-2" />
                    </TableRow>
                  ))}
                {transactions.length === 0 && !txLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
                {enrichedTx.reverse().map((tx: EnrichedTransaction) => (
                  <TableRow key={tx.id}>
                    <TableCell className="px-3 py-2 font-number whitespace-nowrap tabular-nums">
                      {tx.date}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-number whitespace-nowrap tabular-nums">
                      {tx.type === "sell" ? (
                        <span className="text-destructive">
                          −{formatUnits(tx.units)}
                        </span>
                      ) : (
                        formatUnits(tx.units)
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-number whitespace-nowrap tabular-nums">
                      {formatEur(tx.eur_amount)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-number whitespace-nowrap tabular-nums">
                      {tx.currentVal !== null ? (
                        formatEur(tx.currentVal)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right whitespace-nowrap">
                      {tx.type === "sell" && tx.realized_pnl !== null ? (
                        <span
                          className={cn(
                            "font-number text-xs font-medium tabular-nums",
                            tx.realized_pnl >= 0
                              ? "text-green-500"
                              : "text-destructive"
                          )}
                        >
                          {formatEur(tx.realized_pnl)}
                        </span>
                      ) : closedBuyIds.has(tx.id) ? (
                        <span className="text-xs text-muted-foreground">
                          Closed
                        </span>
                      ) : tx.pct !== null ? (
                        <Badge
                          className={cn(
                            "rounded font-number tabular-nums",
                            pnlBadgeClass(tx.pct)
                          )}
                        >
                          {formatPct(tx.pct)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteTx(tx.id)}
                        title="Delete"
                      >
                        <X size={12} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {transactions.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="px-3 py-2 font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-number font-semibold whitespace-nowrap tabular-nums">
                      {formatUnits(totalUnits)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-number font-semibold whitespace-nowrap tabular-nums">
                      {formatEur(totalPaid)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-number font-semibold whitespace-nowrap tabular-nums">
                      {totalCurrentVal !== null
                        ? formatEur(totalCurrentVal)
                        : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right whitespace-nowrap">
                      {totalPct !== null ? (
                        <Badge
                          className={cn(
                            "rounded font-number tabular-nums",
                            pnlBadgeClass(totalPct)
                          )}
                        >
                          {formatPct(totalPct)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
