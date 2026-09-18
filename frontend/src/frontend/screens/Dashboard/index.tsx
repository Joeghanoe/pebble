import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { NetWorthService } from "@/client";
import type { GetNetWorthResponse } from "@/types/api";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { usePortfolio, type HoldingRow } from "@/lib/portfolio";
import { usePreferences } from "@/lib/preferences";
import { CLASS_COLORS, type AssetClass } from "@/lib/asset-identity";
import {
  edgeLabel,
  monthlyPnl,
  sliceTimeframe,
  timeframePeriod,
  TIMEFRAMES,
  type Timeframe,
} from "@/lib/series";
import {
  formatBtc,
  formatEur,
  formatEurPrice,
  formatPct,
  formatUnits,
} from "@/lib/format";
import {
  PbAssetTile,
  PbBar,
  PbCard,
  PbCardHeader,
  PbClassPill,
  PbDonut,
  PbEyebrow,
  PbHeatmap,
  PbLineChart,
  PbPnlBadge,
  PbSegmented,
  pnlClass,
} from "@/frontend/components/pebble";
import { EmptyState } from "@/frontend/screens/EmptyState";

const FILTERS = ["All", "Crypto", "ETF", "Cash"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The dashboard answers one question — am I up or down, and on what — in four
 * blocks that widen from the whole portfolio to a single month.
 */
export function Dashboard() {
  const portfolio = usePortfolio();
  const prefs = usePreferences();
  const [timeframe, setTimeframe] = React.useState<Timeframe>("ALL");
  const [filter, setFilter] = React.useState<Filter>("All");

  const { data: netWorth } = useQuery({
    queryKey: ["net-worth", timeframePeriod(timeframe)],
    queryFn: () =>
      NetWorthService.getNetWorthApiNetWorthGet({
        period: timeframePeriod(timeframe),
      }) as unknown as Promise<GetNetWorthResponse>,
  });

  // The heatmap always wants month-end points, whatever the chart is showing.
  const { data: monthly } = useQuery({
    queryKey: ["net-worth", "1m"],
    queryFn: () =>
      NetWorthService.getNetWorthApiNetWorthGet({
        period: "1m",
      }) as unknown as Promise<GetNetWorthResponse>,
  });

  if (!portfolio.isLoading && portfolio.positions.length === 0) {
    return <EmptyState />;
  }

  const series = sliceTimeframe(netWorth?.snapshots ?? [], timeframe);
  const rows =
    filter === "All"
      ? portfolio.positions
      : portfolio.positions.filter((p) => p.klass === (filter as AssetClass));

  return (
    <>
      <SiteHeader name="Dashboard" />
      <div
        className={cn(
          "pb-fade flex flex-col gap-3.5 p-5 transition-opacity duration-500",
          portfolio.isLoading ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <TotalWorthCard
            portfolio={portfolio}
            series={series}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
          />
          <AllocationCard portfolio={portfolio} />
        </div>

        <HoldingsTable
          rows={rows}
          total={portfolio.positions.length}
          filter={filter}
          onFilter={setFilter}
          showBtc={prefs.denominateInBtc}
          fullPrecision={prefs.fullPrecision}
          dense={prefs.density === "dense"}
        />

        <PbHeatmap rows={monthlyPnl(monthly?.snapshots ?? [])} />
      </div>
    </>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

const DENOMINATIONS = ["EUR", "BTC"] as const;
type Denomination = (typeof DENOMINATIONS)[number];

/** `₿ 0,50530868`. The BTC view's answer to `formatEur`. */
function formatBtcAmount(btc: number): string {
  return `₿ ${formatBtc(btc)}`;
}

function TotalWorthCard({
  portfolio,
  series,
  timeframe,
  onTimeframe,
}: {
  readonly portfolio: ReturnType<typeof usePortfolio>;
  readonly series: readonly {
    date: string;
    total_eur: number;
    invested_eur: number;
    btc_eur: number | null;
  }[];
  readonly timeframe: Timeframe;
  readonly onTimeframe: (next: Timeframe) => void;
}) {
  const [denomination, setDenomination] = React.useState<Denomination>("EUR");

  // Every point needs the BTC price of its own day to convert — today's rate
  // applied to all of history would draw the portfolio's EUR shape, not its
  // shape against bitcoin. Points from before the first BTC price drop out.
  const btcSeries = series.flatMap((point) =>
    point.btc_eur && point.btc_eur > 0
      ? [
          {
            date: point.date,
            total: point.total_eur / point.btc_eur,
            invested: point.invested_eur / point.btc_eur,
          },
        ]
      : [],
  );
  // No BTC holding, no rate, no view — an absent toggle beats one that switches
  // to an empty chart.
  const canDenominateInBtc =
    portfolio.totalBtc !== null && portfolio.btcEurPrice !== null;
  const inBtc = denomination === "BTC" && canDenominateInBtc;

  const points = inBtc
    ? btcSeries
    : series.map((point) => ({
        date: point.date,
        total: point.total_eur,
        invested: point.invested_eur,
      }));

  const format = inBtc ? formatBtcAmount : formatEur;

  // The headline number is profit against what was put in — the same question the
  // position screen answers per asset. The timeframe delta is a second reading:
  // it says how the last week or month moved, not whether the portfolio is ahead.
  //
  // In BTC the percentage is the same figure: dividing worth and cost by one
  // rate cancels it. Only the window below, which uses each day's own rate, tells
  // you anything the EUR view does not.
  const rate = portfolio.btcEurPrice ?? 1;
  const totalWorth = inBtc ? (portfolio.totalBtc ?? 0) : portfolio.totalValue;
  const pnl = inBtc ? portfolio.pnlEur / rate : portfolio.pnlEur;
  const invested = inBtc
    ? portfolio.totalInvested / rate
    : portfolio.totalInvested;

  const opening = points[0]?.total ?? 0;
  const closing = points[points.length - 1]?.total ?? totalWorth;
  const windowChange = closing - opening;
  const windowPct = opening > 0 ? (windowChange / opening) * 100 : 0;
  const hasWindow = points.length > 1;

  const windowLabel: Record<Timeframe, string> = {
    "1W": "vs. a week ago",
    "1M": "vs. a month ago",
    "1Y": "vs. a year ago",
    ALL: "since the first transaction",
  };

  return (
    <PbCard wash="purple" className="p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <PbEyebrow>Total worth</PbEyebrow>
          <div
            className="mt-1.5 font-number leading-none font-medium tracking-[-0.03em] whitespace-nowrap tabular-nums"
            style={{ fontSize: "clamp(28px, 4.2vw, 40px)" }}
          >
            {format(totalWorth)}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "font-number text-[13px] whitespace-nowrap tabular-nums",
                pnlClass(pnl),
              )}
            >
              {format(pnl)}
            </span>
            <PbPnlBadge value={portfolio.pnlPct}>
              {formatPct(portfolio.pnlPct)}
            </PbPnlBadge>
            <span className="text-[11.5px] text-pb-faint">
              {pnl < 0 ? "net loss on cost" : "net profit on cost"}
            </span>
          </div>
          {hasWindow && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-number text-[11.5px] whitespace-nowrap tabular-nums",
                  pnlClass(windowChange),
                )}
              >
                {format(windowChange)}
              </span>
              <span
                className={cn(
                  "font-number text-[11.5px] tabular-nums",
                  pnlClass(windowPct),
                )}
              >
                {formatPct(windowPct)}
              </span>
              <span className="text-[11.5px] text-pb-faint">
                {windowLabel[timeframe]}
                {inBtc && " in BTC"}
              </span>
            </div>
          )}
          <div className="mt-2.5 font-number text-[11.5px] text-pb-muted">
            {inBtc ? (
              <>≡ {formatEur(portfolio.totalValue)} · </>
            ) : (
              portfolio.totalBtc !== null && (
                <>≡ {formatBtc(portfolio.totalBtc)} BTC · </>
              )
            )}
            cost basis {format(invested)}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <PbSegmented
            options={TIMEFRAMES}
            value={timeframe}
            onChange={onTimeframe}
          />
          {canDenominateInBtc && (
            <PbSegmented
              options={DENOMINATIONS}
              value={denomination}
              onChange={setDenomination}
            />
          )}
        </div>
      </div>

      <PbLineChart
        values={points.map((point) => point.total)}
        reference={points.map((point) => point.invested)}
        height={132}
        viewBoxHeight={150}
        variant={inBtc ? "position" : "portfolio"}
        startLabel={points[0] ? edgeLabel(points[0].date, timeframe) : ""}
        endLabel={
          points.length > 1
            ? edgeLabel(points[points.length - 1].date, timeframe)
            : ""
        }
        legend="portfolio — · invested ┄"
        emptyMessage={
          inBtc ? "No BTC price for this range yet" : "Not enough history yet"
        }
        dates={points.map((point) => point.date)}
        formatValue={format}
        seriesLabel="portfolio"
        referenceLabel="invested"
      />
    </PbCard>
  );
}

/* ── Allocation ──────────────────────────────────────────────────────────── */

function AllocationCard({
  portfolio,
}: {
  readonly portfolio: ReturnType<typeof usePortfolio>;
}) {
  return (
    <PbCard className="flex flex-col gap-3.5 p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12.5px] font-semibold">Allocation</h2>
        <span className="font-number text-[10.5px] text-pb-faint">
          by asset class
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-[18px]">
        <PbDonut
          segments={portfolio.allocation.map((entry) => ({
            label: entry.klass,
            color: CLASS_COLORS[entry.klass],
            fraction: entry.fraction,
          }))}
          centerValue={portfolio.positions.length}
          centerLabel="Assets"
        />
        <div className="flex min-w-[140px] flex-1 flex-col gap-2.5">
          {portfolio.allocation.map((entry) => (
            <div key={entry.klass}>
              <div className="flex items-center gap-2">
                <span
                  className="size-[7px] shrink-0 rounded-[2px]"
                  style={{ background: CLASS_COLORS[entry.klass] }}
                />
                <span className="flex-1 text-[12px] text-pb-text-2">
                  {entry.klass}
                </span>
                <span className="font-number text-[11.5px] text-pb-text-3 tabular-nums">
                  {(entry.fraction * 100).toFixed(1).replace(".", ",")}%
                </span>
              </div>
              <PbBar
                percent={entry.fraction * 100}
                color={CLASS_COLORS[entry.klass]}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <ExtremeTile label="Best" holding={portfolio.best} />
        <ExtremeTile label="Worst" holding={portfolio.worst} />
      </div>
    </PbCard>
  );
}

function ExtremeTile({
  label,
  holding,
}: {
  readonly label: string;
  readonly holding: HoldingRow | null;
}) {
  return (
    <div className="rounded-[10px] border border-[#201C2D] bg-pb-raised px-2.5 py-2.5">
      <span className="block font-number text-[9.5px] tracking-[0.1em] text-pb-muted uppercase">
        {label}
      </span>
      {holding ? (
        <span className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="truncate font-number text-[12.5px]">
            {holding.asset.symbol}
          </span>
          <span
            className={cn(
              "font-number text-[12px] tabular-nums",
              pnlClass(holding.pnl_pct),
            )}
          >
            {formatPct(holding.pnl_pct)}
          </span>
        </span>
      ) : (
        <span className="mt-0.5 block font-number text-[12.5px] text-pb-faint">
          —
        </span>
      )}
    </div>
  );
}

/* ── Holdings ────────────────────────────────────────────────────────────── */

/** Header and rows share one grid template so the columns cannot drift apart. */
const COLUMNS =
  "minmax(0,2.1fr) 84px minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.15fr) 72px";

function HoldingsTable({
  rows,
  total,
  filter,
  onFilter,
  showBtc,
  fullPrecision,
  dense,
}: {
  readonly rows: readonly HoldingRow[];
  readonly total: number;
  readonly filter: Filter;
  readonly onFilter: (next: Filter) => void;
  readonly showBtc: boolean;
  readonly fullPrecision: boolean;
  readonly dense: boolean;
}) {
  return (
    <PbCard>
      <PbCardHeader
        title="Holdings"
        note={`${total} position${total === 1 ? "" : "s"}`}
        className="border-b border-pb-subtle"
      >
        <PbSegmented
          mono={false}
          options={FILTERS}
          value={filter}
          onChange={onFilter}
        />
      </PbCardHeader>

      {/* Below ~860px the seven columns cannot fit without crushing the numbers,
          so the grid keeps its width and the card scrolls. */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div
            className="grid gap-2.5 px-[18px] py-2 font-number text-[9.5px] tracking-[0.1em] text-pb-faint uppercase"
            style={{ gridTemplateColumns: COLUMNS }}
          >
            <span>Asset</span>
            <span>Class</span>
            <span className="text-right">Quantity</span>
            <span className="text-right">Price</span>
            <span className="text-right">P&L</span>
            <span className="text-right">Value</span>
            <span className="text-right">Weight</span>
          </div>

          {rows.length === 0 && (
            <p className="px-[18px] py-8 text-center text-[11.5px] text-pb-faint">
              No {filter.toLowerCase()} positions.
            </p>
          )}

          {rows.map((row) => (
            <Link
              key={row.asset.id}
              to="/position/$assetId"
              params={{ assetId: String(row.asset.id) }}
              preload="intent"
              className={cn(
                "grid items-center gap-2.5 border-b border-pb-hairline px-[18px] transition-colors hover:bg-pb-row-hover",
                dense ? "py-[9px]" : "py-3.5",
              )}
              style={{ gridTemplateColumns: COLUMNS }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <PbAssetTile symbol={row.asset.symbol} color={row.color} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium">
                    {row.asset.name}
                  </span>
                  <span className="block font-number text-[10.5px] text-pb-muted">
                    {row.asset.symbol}
                  </span>
                </span>
              </span>

              <span>
                <PbClassPill
                  label={row.klass.toUpperCase()}
                  color={row.color}
                />
              </span>

              <span className="text-right font-number text-[11.5px] text-pb-text-2 tabular-nums">
                {formatUnits(row.units_held, fullPrecision)}
              </span>

              <span className="text-right font-number text-[11.5px] text-pb-text-2 tabular-nums">
                {row.unitPrice === null ? "—" : formatEurPrice(row.unitPrice)}
              </span>

              <span
                className={cn(
                  "text-right font-number text-[11.5px] tabular-nums",
                  pnlClass(row.pnl_pct),
                )}
              >
                {formatPct(row.pnl_pct)}
              </span>

              <span className="text-right">
                <span className="block font-number text-[13px] font-medium whitespace-nowrap tabular-nums">
                  {formatEur(row.current_value_eur)}
                </span>
                <span className="block font-number text-[10px] whitespace-nowrap text-pb-faint tabular-nums">
                  {showBtc && row.valueBtc !== null
                    ? `₿ ${formatBtc(row.valueBtc)}`
                    : `${row.weightPct.toFixed(1).replace(".", ",")}% of total`}
                </span>
              </span>

              <span className="text-right">
                <span className="font-number text-[10.5px] text-pb-text-3 tabular-nums">
                  {row.weightPct.toFixed(1).replace(".", ",")}%
                </span>
                <PbBar percent={row.weightPct} color={row.color} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </PbCard>
  );
}
