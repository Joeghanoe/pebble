import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { GetNetWorthResponse } from "@/types/api";

type Period = "1d" | "1w" | "1m";

function formatEur(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  })
    .format(amount)
    .replaceAll(/\s+/g, "");
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
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
} satisfies ChartConfig;

const PERIODS: { label: string; value: Period }[] = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1m" },
];

interface Props {
  totalValue: number;
  totalValueBtc: number | null;
  totalInvested: number;
  overallPnl: number;
  positionsLoading: boolean;
  netWorthLoading: boolean;
  chartData: GetNetWorthResponse["snapshots"];
  period: Period;
  onPeriodChange: (p: Period) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function TotalValueHeader({
  totalValue,
  totalValueBtc,
  totalInvested,
  overallPnl,
  positionsLoading,
  netWorthLoading,
  chartData,
  period,
  onPeriodChange,
  onRefresh,
  isRefreshing,
}: Readonly<Props>) {
  const pnlEur = totalValue - totalInvested;
  const totalValueBtcLabel =
    totalValueBtc === null ? "N/A BTC" : `${totalValueBtc.toFixed(8)} BTC`;
  const lastSnapshot = chartData.at(-1);
  const lastUpdatedLabel = lastSnapshot ? formatDate(lastSnapshot.date) : "N/A";

  const getPnlColor = () => {
    if (positionsLoading) {
      return "text-muted-foreground";
    }
    if (overallPnl > 0) {
      return "text-green-500";
    }
    if (overallPnl < 0) {
      return "text-red-500";
    }
    return "text-muted-foreground";
  };

  let chartContent: React.ReactNode;
  if (netWorthLoading) {
    chartContent = null;
  } else if (chartData.length === 0) {
    chartContent = (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No snapshots yet
      </div>
    );
  } else {
    chartContent = (
      <div className="relative h-32 w-full">
        <div className="ml-auto z-10 flex gap-1">
          {PERIODS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onPeriodChange(value)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
                period === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <ChartContainer
          config={netWorthChartConfig}
          className="h-28 w-full"
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
            <YAxis
              hide
              domain={["dataMin - 50", "dataMax + 50"]}
              axisLine={false}
              tickLine={false}
            />
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
      </div>
    );
  }

  return (
    <div className="grid h-28 grid-cols-4">
      {/* Contains the total value of the portfolio and P&L */}
      <div
        className={cn(
          "col-span-1 flex flex-col transition-opacity duration-300",
          positionsLoading ? "opacity-0" : "opacity-100",
        )}
      >
        <h1 className="mb-1 text-base text-muted-foreground">Total Worth</h1>
        <span className="font-number text-2xl">{formatEur(totalValue)}</span>
        <span className="font-number text-xs text-muted-foreground uppercase">
          {totalValueBtcLabel}
        </span>
        <div className="mt-1">
          <span className={cn(getPnlColor(), "font-number")}>
            {formatEur(pnlEur)}
          </span>
          <Badge
            variant="outline"
            className={cn("ml-2 font-number", getPnlColor())}
          >
            {formatPct(overallPnl)}
          </Badge>
        </div>
      </div>

      {/* Contains the chart over time */}
      <div className="col-span-2">{chartContent}</div>

      {/* Contains Sync Button (to refresh data) */}
      <div className="col-span-1 flex flex-col items-center justify-center gap-2">
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
  );
}
