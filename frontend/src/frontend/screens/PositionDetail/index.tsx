import * as React from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  PositionsService,
  TransactionsService,
  ExchangesService,
} from "@/client";
import type {
  GetExchangesResponse,
  GetPositionHistoryResponse,
  GetTransactionsResponse,
} from "@/types/api";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { usePortfolio } from "@/lib/portfolio";
import { usePreferences } from "@/lib/preferences";
import { priceFreshness } from "@/lib/priceFreshness";
import {
  edgeLabel,
  sliceTimeframe,
  timeframePeriod,
  TIMEFRAMES,
  type Timeframe,
} from "@/lib/series";
import {
  formatEur,
  formatEurPrice,
  formatPct,
  formatSats,
  formatUnits,
  formatUsdPrice,
} from "@/lib/format";
import {
  buildPnlChartData,
  enrichTransactions,
  getOpenBuyTransactions,
} from "@/lib/position-analytics";
import { buildCadence } from "@/lib/cadence";
import { SiteHeader } from "@/components/site-header";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EditPositionModal } from "@/frontend/components/EditPositionModal";
import { useTransactionModal } from "@/frontend/components/TransactionModalProvider";
import {
  PbCadenceChart,
  PbCard,
  PbCardHeader,
  PbEyebrow,
  PbGhostButton,
  PbLineChart,
  PbPnlBadge,
  PbPnlByBuyChart,
  PbSegmented,
  PbStatTile,
  pnlClass,
} from "@/frontend/components/pebble";

/** Header and rows share one template. */
const COLUMNS =
  "110px 70px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 90px 28px";

/**
 * One position: what it is worth now, what it cost, and every transaction that
 * got it there.
 */
export function PositionDetail() {
  const { assetId: raw } = useParams({ strict: false });
  const assetId = Number(raw ?? "0");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const { openTransaction } = useTransactionModal();
  const [timeframe, setTimeframe] = React.useState<Timeframe>("1M");

  const portfolio = usePortfolio();
  const position = portfolio.positions.find((p) => p.asset.id === assetId);

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", assetId],
    queryFn: () =>
      TransactionsService.listTransactionsApiTransactionsAssetIdGet({
        assetId,
      }) as unknown as Promise<GetTransactionsResponse>,
  });

  const { data: history } = useQuery({
    queryKey: ["position-history", assetId, timeframePeriod(timeframe)],
    queryFn: () =>
      PositionsService.getPositionHistoryApiPositionsAssetIdHistoryGet({
        assetId,
        period: timeframePeriod(timeframe),
      }) as unknown as Promise<GetPositionHistoryResponse>,
  });

  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () =>
      ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
  });

  const deleteTx = useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["transactions", assetId],
      });
      void queryClient.invalidateQueries({ queryKey: ["position-history"] });
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not delete that transaction.")),
  });

  const deletePosition = useMutation({
    mutationFn: () => api.deleteAsset(assetId),
    onSuccess: async () => {
      toast.success("Position deleted.");
      await queryClient.invalidateQueries({ queryKey: ["positions"] });
      void navigate({ to: "/" });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not delete that position.")),
  });

  if (!position && !portfolio.isLoading) {
    return (
      <>
        <SiteHeader name="Not found" sublabel="no such position" onBack />
        <div className="p-5 text-[12.5px] text-pb-text-3">
          That position is not in the portfolio any more.
        </div>
      </>
    );
  }

  const symbol = position?.asset.symbol ?? "…";
  const transactions = txData?.transactions ?? [];
  const unitPrice = position?.unitPrice ?? null;
  const priceResult = position?.price_result;
  const priceUsd =
    priceResult &&
    priceResult.status !== "unavailable" &&
    priceResult.exchange_rate
      ? priceResult.price_eur * priceResult.exchange_rate
      : null;

  const freshness = priceFreshness(priceResult, position?.asset.type ?? "");

  const enriched = enrichTransactions(transactions, unitPrice);
  const buys = transactions.filter((t) => t.type === "buy").length;

  // Lots a sell has already closed are not still "open buys", so FIFO decides
  // which of them the profit chart is still talking about.
  const soldUnits = transactions
    .filter((t) => t.type === "sell")
    .reduce((sum, t) => sum + t.units, 0);
  const pnlByBuy = buildPnlChartData(
    getOpenBuyTransactions(enriched, soldUnits),
  );
  const cadence = buildCadence(transactions);
  const averageCost =
    position && position.units_held > 0
      ? position.total_invested_eur / position.units_held
      : null;
  const btcEquivalent =
    portfolio.btcEurPrice && portfolio.btcEurPrice > 0 && position
      ? position.current_value_eur / portfolio.btcEurPrice
      : null;

  const series = sliceTimeframe(history?.points ?? [], timeframe);

  return (
    <>
      <SiteHeader name={symbol} sublabel={position?.asset.name} onBack>
        {position && (
          <EditPositionModal
            asset={position.asset}
            exchanges={exchangesData?.exchanges ?? []}
          />
        )}
        <ConfirmButton
          title={`Delete ${symbol}?`}
          description="The position goes, and so do its transactions, cached prices and snapshots. This cannot be undone."
          confirmLabel="Delete position"
          onConfirm={() => deletePosition.mutateAsync()}
        >
          <button
            type="button"
            title="Delete position"
            className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-pb-input text-pb-text-3 transition-colors hover:border-[rgba(248,113,113,.4)] hover:text-pb-down"
          >
            <Trash2 size={13} />
          </button>
        </ConfirmButton>
      </SiteHeader>

      <div
        className={cn(
          "pb-fade flex flex-col gap-3.5 p-5 transition-opacity duration-500",
          portfolio.isLoading ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <PbCard wash="orange" className="p-[18px]">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-[1_1_220px]">
                <PbEyebrow>Market value</PbEyebrow>
                <div
                  className="mt-1.5 font-number leading-none font-medium tracking-[-0.03em] whitespace-nowrap tabular-nums"
                  style={{ fontSize: "clamp(26px, 3.8vw, 36px)" }}
                >
                  {formatEur(position?.current_value_eur ?? 0)}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  <span
                    className={cn(
                      "font-number text-[13px] whitespace-nowrap tabular-nums",
                      pnlClass(position?.pnlEur ?? 0),
                    )}
                  >
                    {formatEur(position?.pnlEur ?? 0)}
                  </span>
                  <PbPnlBadge value={position?.pnl_pct ?? 0}>
                    {formatPct(position?.pnl_pct ?? 0)}
                  </PbPnlBadge>
                  <span className="text-[11.5px] text-pb-faint">on cost</span>
                </div>
              </div>
              <PbSegmented
                options={TIMEFRAMES}
                value={timeframe}
                onChange={setTimeframe}
              />
            </div>

            <PbLineChart
              values={series.map((point) => point.price_eur)}
              reference={series.map((point) =>
                point.units_held > 0
                  ? point.invested_eur / point.units_held
                  : point.price_eur,
              )}
              height={120}
              viewBoxHeight={140}
              variant="position"
              startLabel={series[0] ? edgeLabel(series[0].date, timeframe) : ""}
              endLabel={
                series.length > 1
                  ? edgeLabel(series[series.length - 1].date, timeframe)
                  : ""
              }
              legend="price — · avg cost ┄"
              emptyMessage="Snapshots start once prices have been refreshed"
              dates={series.map((point) => point.date)}
              formatValue={formatEurPrice}
              seriesLabel="price"
              referenceLabel="avg cost"
            />
          </PbCard>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <PbStatTile
              eyebrow="Holdings"
              value={formatUnits(
                position?.units_held ?? 0,
                prefs.fullPrecision,
              )}
              caption={`${symbol} on hand`}
            />
            <PbStatTile
              eyebrow="Unit price"
              value={unitPrice === null ? "—" : formatEurPrice(unitPrice)}
              valueClassName="text-pb-accent"
              caption={
                freshness === null ? (
                  "no feed configured"
                ) : freshness.overdue ? (
                  <span className="text-pb-down">{freshness.label}</span>
                ) : priceUsd === null ? (
                  freshness.label
                ) : (
                  `${freshness.label} · ${formatUsdPrice(priceUsd)}`
                )
              }
            />
            <PbStatTile
              eyebrow="Invested"
              value={formatEur(position?.total_invested_eur ?? 0)}
              caption={`across ${buys} buy${buys === 1 ? "" : "s"}`}
            />
            <PbStatTile
              eyebrow="Avg cost"
              value={averageCost === null ? "—" : formatEurPrice(averageCost)}
              caption={`per ${symbol}`}
            />
            <PbStatTile
              eyebrow="Unrealised"
              value={formatEur(position?.pnlEur ?? 0)}
              valueClassName={pnlClass(position?.pnlEur ?? 0)}
              caption={`${formatPct(position?.pnl_pct ?? 0)} on cost`}
            />
            {prefs.denominateInBtc && btcEquivalent !== null ? (
              <PbStatTile
                eyebrow="In sats"
                value={formatSats(btcEquivalent)}
                valueClassName="text-pb-purple-light"
                caption="sats equivalent"
              />
            ) : (
              <PbStatTile
                eyebrow="Weight"
                value={`${(position?.weightPct ?? 0).toFixed(1).replace(".", ",")}%`}
                valueClassName="text-pb-purple-light"
                caption="of portfolio"
              />
            )}
          </div>
        </div>

        {/* The pair the release build had below the hero: which buys are in
            profit, and how steadily they were made. */}
        <div className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-2">
          <PbPnlByBuyChart points={pnlByBuy} />
          <PbCadenceChart cadence={cadence} />
        </div>

        {/* Ledger */}
        <PbCard>
          <PbCardHeader
            title="Transactions"
            note={`${transactions.length} entr${transactions.length === 1 ? "y" : "ies"}`}
            className="border-b border-pb-subtle"
          >
            <PbGhostButton
              className="h-[27px] px-2.5 text-[11.5px] hover:border-[rgba(247,147,26,.5)] hover:text-pb-accent"
              onClick={() => openTransaction(assetId)}
            >
              <Plus size={12} strokeWidth={2.2} />
              Add
            </PbGhostButton>
          </PbCardHeader>

          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div
                className="grid gap-2.5 px-[18px] py-2 font-number text-[9.5px] tracking-[0.1em] text-pb-faint uppercase"
                style={{ gridTemplateColumns: COLUMNS }}
              >
                <span>Date</span>
                <span>Type</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Value now</span>
                <span className="text-right">P&L</span>
                <span />
              </div>

              {!txLoading && transactions.length === 0 && (
                <p className="px-[18px] py-8 text-center text-[11.5px] text-pb-faint">
                  No transactions yet.
                </p>
              )}

              {[...enriched].reverse().map((tx) => {
                const paidPerUnit = tx.units > 0 ? tx.eur_amount / tx.units : 0;
                const isSell = tx.type === "sell";
                return (
                  <div
                    key={tx.id}
                    className={cn(
                      "grid items-center gap-2.5 border-b border-pb-hairline px-[18px] transition-colors hover:bg-pb-row-hover",
                      prefs.density === "dense" ? "py-[9px]" : "py-3.5",
                    )}
                    style={{ gridTemplateColumns: COLUMNS }}
                  >
                    <span className="font-number text-[11.5px] text-pb-text-2 tabular-nums">
                      {tx.date}
                    </span>
                    <span>
                      <span
                        className="inline-block rounded-[5px] px-[7px] py-0.5 font-number text-[9.5px]"
                        style={{
                          background: isSell
                            ? "rgba(248,113,113,.1)"
                            : "rgba(52,211,153,.1)",
                          color: isSell ? "#F87171" : "#34D399",
                        }}
                      >
                        {isSell ? "SELL" : "BUY"}
                      </span>
                    </span>
                    <span className="text-right font-number text-[11.5px] tabular-nums">
                      {formatUnits(tx.units, prefs.fullPrecision)}
                    </span>
                    <span className="text-right font-number text-[11.5px] text-pb-text-3 tabular-nums">
                      {formatEurPrice(paidPerUnit)}
                    </span>
                    <span className="text-right font-number text-[11.5px] tabular-nums">
                      {formatEur(tx.eur_amount)}
                    </span>
                    <span className="text-right font-number text-[11.5px] tabular-nums">
                      {tx.currentVal === null ? "—" : formatEur(tx.currentVal)}
                    </span>
                    <span className="text-right">
                      {isSell &&
                      tx.realized_pnl !== null &&
                      tx.realized_pnl !== undefined ? (
                        <LedgerPnl value={tx.realized_pnl}>
                          {formatEur(tx.realized_pnl)}
                        </LedgerPnl>
                      ) : tx.pct === null ? (
                        <span className="font-number text-[11px] text-pb-faint">
                          —
                        </span>
                      ) : (
                        <LedgerPnl value={tx.pct}>
                          {formatPct(tx.pct)}
                        </LedgerPnl>
                      )}
                    </span>
                    <span className="text-right">
                      <ConfirmButton
                        title="Delete this transaction?"
                        description={
                          <>
                            {isSell ? "Sell" : "Buy"} of{" "}
                            {formatUnits(tx.units, prefs.fullPrecision)}{" "}
                            {symbol} for {formatEur(tx.eur_amount)} on {tx.date}
                            . Holdings and invested totals are recalculated
                            without it.
                          </>
                        }
                        onConfirm={() => deleteTx.mutateAsync(tx.id)}
                      >
                        <button
                          type="button"
                          title="Delete"
                          className="text-pb-bright transition-colors hover:text-pb-down"
                        >
                          <X size={13} />
                        </button>
                      </ConfirmButton>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </PbCard>
      </div>
    </>
  );
}

function LedgerPnl({
  value,
  children,
}: {
  readonly value: number;
  readonly children: React.ReactNode;
}) {
  const up = value >= 0;
  return (
    <span
      className="inline-block rounded-[5px] px-[7px] py-0.5 font-number text-[11px] whitespace-nowrap tabular-nums"
      style={{
        background: up ? "rgba(52,211,153,.1)" : "rgba(248,113,113,.1)",
        color: up ? "#34D399" : "#F87171",
      }}
    >
      {children}
    </span>
  );
}
