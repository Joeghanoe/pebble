// src/lib/portfolio.ts
import { useQuery } from "@tanstack/react-query";
import { PositionsService } from "@/client";
import type { GetPositionsResponse, Position } from "@/types/api";
import { assetClass, assetColor, type AssetClass } from "@/lib/asset-identity";

export interface HoldingRow extends Position {
  color: string;
  klass: AssetClass;
  /** Live unit price, or null when the feed has nothing for this asset. */
  unitPrice: number | null;
  pnlEur: number;
  /** Share of total worth, 0–100. */
  weightPct: number;
  /** Value expressed in BTC, or null when there is no BTC price to divide by. */
  valueBtc: number | null;
}

export interface Portfolio {
  positions: HoldingRow[];
  totalValue: number;
  totalInvested: number;
  pnlEur: number;
  pnlPct: number;
  /** Total worth in BTC, or null without a BTC price. */
  totalBtc: number | null;
  btcEurPrice: number | null;
  allocation: { klass: AssetClass; value: number; fraction: number }[];
  best: HoldingRow | null;
  worst: HoldingRow | null;
  lastUpdated: string | null;
  isLoading: boolean;
}

const CLASS_ORDER: AssetClass[] = ["Crypto", "ETF", "Cash"];

/**
 * Everything the chrome and the dashboard derive from one `/positions` call.
 *
 * It is a single query key, so the sidebar, the topbar and the holdings table
 * share one cache entry rather than each fetching the portfolio for themselves.
 */
export function usePortfolio(): Portfolio {
  const { data, isLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: () =>
      PositionsService.getPositionsApiPositionsGet() as unknown as Promise<GetPositionsResponse>,
  });

  const raw = data?.positions ?? [];
  const totalValue = raw.reduce((sum, p) => sum + p.current_value_eur, 0);
  const totalInvested = raw.reduce((sum, p) => sum + p.total_invested_eur, 0);

  const btc = raw.find(
    (p) =>
      p.asset.symbol.toUpperCase() === "BTC" &&
      p.price_result.status !== "unavailable",
  );
  const btcEurPrice =
    btc && btc.units_held > 0 ? btc.current_value_eur / btc.units_held : null;

  const positions: HoldingRow[] = raw
    .map((position) => ({
      ...position,
      color: assetColor(position.asset),
      klass: assetClass(position.asset.type),
      unitPrice:
        position.price_result.status === "unavailable"
          ? null
          : position.price_result.price_eur,
      pnlEur: position.current_value_eur - position.total_invested_eur,
      weightPct:
        totalValue > 0 ? (position.current_value_eur / totalValue) * 100 : 0,
      valueBtc:
        btcEurPrice && btcEurPrice > 0
          ? position.current_value_eur / btcEurPrice
          : null,
    }))
    .sort((a, b) => b.current_value_eur - a.current_value_eur);

  const allocation = CLASS_ORDER.map((klass) => {
    const value = positions
      .filter((p) => p.klass === klass)
      .reduce((sum, p) => sum + p.current_value_eur, 0);
    return { klass, value, fraction: totalValue > 0 ? value / totalValue : 0 };
  }).filter((entry) => entry.value > 0);

  // Best and worst are about performance, so positions the feed cannot price are
  // not candidates — their P&L is stale, not good or bad.
  const ranked = positions
    .filter((p) => p.unitPrice !== null && p.total_invested_eur > 0)
    .sort((a, b) => b.pnl_pct - a.pnl_pct);

  return {
    positions,
    totalValue,
    totalInvested,
    pnlEur: totalValue - totalInvested,
    pnlPct:
      totalInvested > 0
        ? ((totalValue - totalInvested) / totalInvested) * 100
        : 0,
    totalBtc: btcEurPrice && btcEurPrice > 0 ? totalValue / btcEurPrice : null,
    btcEurPrice,
    allocation,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    lastUpdated: data?.last_updated ?? null,
    isLoading,
  };
}
