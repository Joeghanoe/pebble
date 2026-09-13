// src/lib/asset-identity.ts
import type { Asset } from "@/types/db";

/**
 * The colour an asset is drawn in, everywhere: the sidebar dot, the holdings
 * tile, the class pill, the weight bar, the allocation legend.
 *
 * The accent contract constrains this. BTC orange is an action colour, so it is
 * spent on exactly one asset — Bitcoin — and never handed out as a generic
 * "crypto" tint. Everything else comes from the purple/blue chrome range.
 */
const BY_SYMBOL: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#A78BFA",
};

const BY_TYPE: Record<Asset["type"], string> = {
  crypto: "#C084FC",
  etf: "#8B5CF6",
  stock: "#6D9BF6",
  cash: "#6F6885",
};

export function assetColor(asset: Pick<Asset, "symbol" | "type">): string {
  return BY_SYMBOL[asset.symbol.toUpperCase()] ?? BY_TYPE[asset.type];
}

/** The `CRYPTO` / `ETF` / `CASH` pill text. */
export function assetClassLabel(type: Asset["type"]): string {
  return type.toUpperCase();
}

/** Tints are derived from the identity colour, not authored: 10% fill, 20% ring. */
export function assetTint(color: string): { fill: string; ring: string } {
  return { fill: `${color}1A`, ring: `${color}33` };
}

/** The four buckets the holdings filter and the allocation donut agree on. */
export type AssetClass = "Crypto" | "ETF" | "Cash";

export function assetClass(type: Asset["type"]): AssetClass {
  if (type === "cash") {
    return "Cash";
  }
  // Stocks and ETFs are one bucket on the dashboard: the distinction matters to
  // the price feed, not to "how is my money split up".
  if (type === "etf" || type === "stock") {
    return "ETF";
  }
  return "Crypto";
}

export const CLASS_COLORS: Record<AssetClass, string> = {
  Crypto: "#F7931A",
  ETF: "#8B5CF6",
  Cash: "#3F3A55",
};
