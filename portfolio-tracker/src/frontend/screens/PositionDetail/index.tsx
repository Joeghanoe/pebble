import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts"
import { ArrowLeft, RefreshCw, X } from "lucide-react"
import { useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { queryClient, fetchJson } from "@/lib/queryClient"
import { apiUrl } from "@/lib/api"
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

// Per-asset cooldown so navigating back and forth doesn't re-fetch within 15 min
const lastRefreshAt = new Map<number, number>()
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

export function PositionDetail({ assetId, onBack }: Props) {
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
    mutationFn: () => fetch(apiUrl("/api/prices/refresh"), { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
    },
  })

  const deleteTx = useMutation({
    mutationFn: (id: number) =>
      fetch(apiUrl(`/api/transactions/${id}/delete`), { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["transactions", assetId],
      })
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
    },
  })

  useEffect(() => {
    const last = lastRefreshAt.get(assetId) ?? 0
    if (Date.now() - last < COOLDOWN_MS) return
    lastRefreshAt.set(assetId, Date.now())
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
    lastRefreshAt.set(assetId, Date.now())
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

  const pnlChartData = buyTxs.map((t) => ({
    date: t.date,
    pnl: t.pct !== null ? parseFloat(t.pct.toFixed(2)) : 0,
  }))

  const valueChartData = buyTxs.map((t) => ({
    date: t.date,
    value: t.currentVal !== null ? parseFloat(t.currentVal.toFixed(2)) : 0,
  }))

  const scatterData = buyTxs.map((t, i) => ({
    index: i + 1,
    date: t.date,
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
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
      </SiteHeader>
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Data Dashboard card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Data Dashboard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Total {symbol} to date
                </span>
                {positionsLoading ? (
                  <Skeleton className="h-4 w-28" />
                ) : (
                  <span className="font-medium tabular-nums">
                    {formatUnits(unitsHeld)}
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Invested</span>
                {positionsLoading ? (
                  <Skeleton className="h-4 w-28" />
                ) : (
                  <span className="font-medium tabular-nums">
                    {formatEur(totalInvested)}
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Value {symbol} Portfolio
                </span>
                {positionsLoading ? (
                  <Skeleton className="h-4 w-28" />
                ) : (
                  <span className="font-medium tabular-nums">
                    {formatEur(currentValue)}
                  </span>
                )}
              </div>

              {/* P&L highlight */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">Profit/Loss</span>
                {positionsLoading ? (
                  <Skeleton className="h-8 w-28 rounded" />
                ) : (
                  <span
                    className={`rounded px-3 py-1 text-lg font-bold tabular-nums ${pnlEur >= 0 ? "bg-green-500/15 text-green-500" : "bg-destructive/15 text-destructive"}`}
                  >
                    {formatEur(pnlEur)}
                  </span>
                )}
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Average P/L</span>
                {positionsLoading ? (
                  <Skeleton className="h-4 w-16" />
                ) : (
                  <span
                    className={`font-medium tabular-nums ${pnlPct >= 0 ? "text-green-500" : "text-destructive"}`}
                  >
                    {formatPct(pnlPct)}
                  </span>
                )}
              </div>

              {/* Price row */}
              {priceEur !== null && (
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
                  <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
                    <div className="mb-0.5 text-xs text-muted-foreground">
                      {symbol} Price
                    </div>
                    <div className="font-bold text-primary tabular-nums">
                      {formatEurPrice(priceEur)}
                    </div>
                  </div>
                  {priceUsd !== null && (
                    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
                      <div className="mb-0.5 text-xs text-muted-foreground">
                        {symbol} USD Price
                      </div>
                      <div className="font-bold text-primary tabular-nums">
                        {formatUsdPrice(priceUsd)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {priceResult?.status === "stale" && (
                <p className="text-xs text-muted-foreground">
                  Last known: {priceResult.lastKnownDate}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Profit and Loss Overview chart */}
          {pnlChartData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Profit and Loss Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart
                    data={pnlChartData}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
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
                    <Tooltip
                      formatter={(v) => [`${Number(v).toFixed(2)}%`, "P&L"]}
                      labelStyle={{ fontSize: 11 }}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pnl"
                      stroke="var(--primary)"
                      dot={{ r: 3, fill: "var(--primary)" }}
                      strokeWidth={1.5}
                      label={{
                        position: "top",
                        fontSize: 8,
                        formatter: (v: unknown) => `${Number(v)}%`,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* EUR Current Value chart */}
          {valueChartData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  EUR Current Value per Lot
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart
                    data={valueChartData}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
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
                      tickFormatter={(v: number) => `€${v.toFixed(0)}`}
                    />
                    <Tooltip
                      formatter={(v) => [formatEur(Number(v)), "Value"]}
                      labelStyle={{ fontSize: 11 }}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--primary)"
                      dot={{ r: 3, fill: "var(--primary)" }}
                      strokeWidth={1.5}
                      label={{
                        position: "top",
                        fontSize: 8,
                        formatter: (v: unknown) => `€${Number(v).toFixed(0)}`,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Investing frequency scatter */}
          {scatterData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Investing Frequency — the more linear the better
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={180}>
                  <ScatterChart
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="index"
                      type="number"
                      name="Index"
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      dataKey="date"
                      type="category"
                      name="Date"
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <ZAxis range={[30, 30]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ payload }) => {
                        const item = payload?.[0]?.payload as
                          | { date: string; index: number }
                          | undefined
                        if (!item) return null
                        return (
                          <div className="rounded border border-border bg-card p-2 text-xs shadow">
                            {item.date}
                          </div>
                        )
                      }}
                    />
                    <Scatter data={scatterData} fill="var(--primary)" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Transaction table */}
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle>Transaction Log</CardTitle>
              <AddTransactionModal
                assetId={assetId}
                trigger={
                  <Button variant="outline" size="sm">
                    + Add Transaction
                  </Button>
                }
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-2 whitespace-nowrap">
                    Date
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    {symbol} Amount
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    EUR Paid
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    EUR Current Value
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right whitespace-nowrap">
                    Profit/Loss
                  </TableHead>
                  <TableHead className="px-3 py-2">Notes</TableHead>
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
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="px-3 py-2" />
                    </TableRow>
                  ))}
                {transactions.length === 0 && !txLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
                {enrichedTx.map(
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
                        {tx.pct !== null ? (
                          <Badge
                            className={`rounded tabular-nums ${pnlBadgeClass(tx.pct)}`}
                          >
                            {formatPct(tx.pct)}
                          </Badge>
                        ) : tx.type === "sell" && tx.realized_pnl !== null ? (
                          <span
                            className={`text-xs font-medium tabular-nums ${tx.realized_pnl >= 0 ? "text-green-500" : "text-destructive"}`}
                          >
                            {formatEur(tx.realized_pnl)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            0.00%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {tx.notes ?? ""}
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
