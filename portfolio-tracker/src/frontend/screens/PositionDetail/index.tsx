import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import { ArrowLeft, RefreshCw, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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
import { AddTransactionModal } from "@/frontend/components/AddTransactionModal"
import { EditPositionModal } from "@/frontend/components/EditPositionModal"
import type {
  GetPositionsResponse,
  GetTransactionsResponse,
  GetExchangesResponse,
} from "@/types/api"
import type { Transaction } from "@/types/db"
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

const pnlChartConfig = {
  pnl: { label: "P&L", color: "var(--primary)" },
} satisfies ChartConfig

const valueChartConfig = {
  value: { label: "Value", color: "var(--primary)" },
} satisfies ChartConfig

const frequencyChartConfig = {
  timestamp: { label: "Date", color: "var(--primary)" },
} satisfies ChartConfig

const COOLDOWN_MS = 15 * 60 * 1000

function formatEur(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

/** For unit prices: use up to 8 significant decimal places when the value is < €0.01 */
function formatEurPrice(amount: number): string {
  if (Math.abs(amount) < 0.01 && amount !== 0) {
    const decimals = Math.max(2, -Math.floor(Math.log10(Math.abs(amount))) + 3)
    return "€\u202F" + amount.toFixed(Math.min(decimals, 8)).replace(".", ",")
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

function formatUsdPrice(amount: number): string {
  if (Math.abs(amount) < 0.01 && amount !== 0) {
    const decimals = Math.max(2, -Math.floor(Math.log10(Math.abs(amount))) + 3)
    return "$" + amount.toFixed(Math.min(decimals, 8))
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

function formatUnits(n: number): string {
  return n.toFixed(8).replace(/\.?0+$/, "")
}

interface Props {
  assetId: number
  onBack: () => void
}

export function PositionDetail({ assetId, onBack }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const lastRefreshAtRef = useRef<Map<number, number>>(new Map())
  
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

  const refreshPrices = useMutation({
    mutationFn: () => api.refreshPrices(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
    },
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

  useEffect(() => {
    const last = lastRefreshAtRef.current.get(assetId) ?? 0
    if (Date.now() - last < COOLDOWN_MS) return
    lastRefreshAtRef.current.set(assetId, Date.now())
    refreshPrices.mutate()
  }, [assetId])

  const exchanges = exchangesData?.exchanges ?? []
  const position = positionsData?.positions.find((p) => p.asset.id === assetId)
  const transactions = txData?.transactions ?? []

  async function handleDeleteTx(id: number) {
    if (!confirm("Delete this transaction?")) return
    deleteTx.mutate(id)
  }

  function handleRefreshPrice() {
    lastRefreshAtRef.current.set(assetId, Date.now())
    refreshPrices.mutate()
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

  const enrichedTx = transactions.map((tx) => {
    if (tx.type === "buy" && priceEur !== null) {
      const currentVal = tx.units * priceEur
      const pct = ((currentVal - tx.eur_amount) / tx.eur_amount) * 100
      return { ...tx, currentVal, pct }
    }
    return { ...tx, currentVal: null, pct: null }
  })

  const buyTxs = enrichedTx.filter((t) => t.type === "buy")

  // FIFO: oldest buy lots are closed first when sells occur
  const totalSoldUnits = transactions
    .filter((t) => t.type === "sell")
    .reduce((sum, t) => sum + t.units, 0)
  const closedBuyIds = new Set<number>()
  let remainingSold = totalSoldUnits
  for (const tx of [...buyTxs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (remainingSold <= 0) break
    if (remainingSold >= tx.units) {
      closedBuyIds.add(tx.id)
      remainingSold -= tx.units
    } else {
      remainingSold = 0
    }
  }
  const openBuyTxs = buyTxs.filter((t) => !closedBuyIds.has(t.id))

  const pnlChartData = openBuyTxs.map((t) => ({
    date: t.date,
    pnl: t.pct !== null ? parseFloat(t.pct.toFixed(2)) : 0,
  }))

  const valueChartData = openBuyTxs.map((t) => ({
    date: t.date,
    value: t.currentVal !== null ? parseFloat(t.currentVal.toFixed(2)) : 0,
  }))

  const frequencyData = buyTxs.map((t, i) => ({
    index: i + 1,
    date: t.date,
    timestamp: new Date(t.date).getTime(),
  }))

  const totalUnits = transactions.reduce(
    (s, t) => (t.type === "buy" ? s + t.units : s - t.units),
    0
  )
  const totalPaid = transactions.reduce(
    (s, t) => (t.type === "buy" ? s + t.eur_amount : s - t.eur_amount),
    0
  )
  const totalCurrentVal = priceEur !== null ? totalUnits * priceEur : null
  const totalPct =
    totalPaid > 0 && totalCurrentVal !== null
      ? ((totalCurrentVal - totalPaid) / totalPaid) * 100
      : null

  if (!position && !positionsLoading) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <p className="mt-4 text-muted-foreground">Position not found</p>
      </div>
    )
  }

  const pnlBadgeClass = (pct: number) =>
    pct > 0
      ? "bg-green-500/15 text-green-500 border-transparent"
      : pct < 0
        ? "bg-destructive/15 text-destructive border-transparent"
        : "bg-muted text-muted-foreground border-transparent"

  return (
    <>
      <SiteHeader name={symbol}>
        <Button variant="ghost" size="sm" onClick={onBack}>
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

      <div className={`gap-4 flex flex-col p-6 transition-opacity duration-500 ${positionsLoading || txLoading ? "opacity-0" : "opacity-100"}`}>
        {/* Position header — mirrors TotalValueHeader layout */}
        <div className={`grid items-start gap-6 ${valueChartData.length > 1 ? "grid-cols-4" : "grid-cols-2"}`}>
          {/* Key metrics */}
          <div className="col-span-1 flex flex-col gap-1">
            <h1 className="text-base text-muted-foreground">Current Value</h1>
            <span className="text-4xl">
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
                    ? "text-muted-foreground"
                    : pnlEur >= 0
                      ? "text-green-500"
                      : "text-destructive"
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
                className={`ml-2 ${positionsLoading ? "text-muted-foreground" : pnlPct >= 0 ? "text-green-500" : "text-destructive"}`}
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
          {valueChartData.length > 1 && (
          <div className="col-span-2">
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
          )}

          {/* Secondary stats */}
          <div className="col-span-1 flex flex-col gap-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs tracking-wider text-muted-foreground uppercase">
                Holdings
              </span>
              <span className="font-medium tabular-nums">
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
              <span className="font-medium tabular-nums">
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
                <span className="font-medium tabular-nums text-primary">
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
            className={`grid gap-4 ${pnlChartData.length > 1 && frequencyData.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
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
        <Card className="gap-3 py-0 overflow-hidden">
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
                {enrichedTx.reverse().map(
                  (
                    tx: Transaction & {
                      currentVal: number | null
                      pct: number | null
                    }
                  ) => (
                    <TableRow key={tx.id}>
                      <TableCell className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {tx.date}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {tx.type === "sell" ? (
                          <span className="text-destructive">
                            −{formatUnits(tx.units)}
                          </span>
                        ) : (
                          formatUnits(tx.units)
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {formatEur(tx.eur_amount)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {tx.currentVal !== null ? (
                          formatEur(tx.currentVal)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right whitespace-nowrap">
                        {tx.type === "sell" && tx.realized_pnl !== null ? (
                          <span
                            className={`text-xs font-medium tabular-nums ${tx.realized_pnl >= 0 ? "text-green-500" : "text-destructive"}`}
                          >
                            {formatEur(tx.realized_pnl)}
                          </span>
                        ) : closedBuyIds.has(tx.id) ? (
                          <span className="text-xs text-muted-foreground">
                            Closed
                          </span>
                        ) : tx.pct !== null ? (
                          <Badge
                            className={`rounded tabular-nums ${pnlBadgeClass(tx.pct)}`}
                          >
                            {formatPct(tx.pct)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
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
                  )
                )}
              </TableBody>
              {transactions.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="px-3 py-2 font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                      {formatUnits(totalUnits)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                      {formatEur(totalPaid)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                      {totalCurrentVal !== null
                        ? formatEur(totalCurrentVal)
                        : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right whitespace-nowrap">
                      {totalPct !== null ? (
                        <Badge
                          className={`rounded tabular-nums ${pnlBadgeClass(totalPct)}`}
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
