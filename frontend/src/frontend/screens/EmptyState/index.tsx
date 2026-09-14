import { TrendingUp } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PbDot } from "@/frontend/components/pebble";
import { useTransactionModal } from "@/frontend/components/TransactionModalProvider";
import type { PositionPrefill } from "@/frontend/components/AddPositionModal";

/**
 * The four assets most people start with, as one-click openers. Each carries the
 * price-feed identity too, so a quick pick lands on a form that only needs the
 * venue confirming.
 */
const QUICK_PICKS: (PositionPrefill & { color: string })[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "crypto",
    coingeckoId: "bitcoin",
    color: "#F7931A",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    type: "crypto",
    coingeckoId: "ethereum",
    color: "#A78BFA",
  },
  {
    symbol: "VUAA",
    name: "Vanguard S&P 500 UCITS ETF",
    type: "etf",
    yahooTicker: "VUAA.L",
    color: "#8B5CF6",
  },
  { symbol: "EUR", name: "Cash", type: "cash", color: "#6F6885" },
];

const STEPS = [
  {
    title: "Add a position",
    description: "Pick an asset — crypto, ETF or plain cash.",
  },
  {
    title: "Log what you paid",
    description: "Each buy builds your real cost basis.",
  },
  {
    title: "Watch the truth",
    description: "P&L in euro, in percent, and in sats.",
  },
];

/**
 * First run. Shown as its own route and in place of the dashboard while the
 * portfolio is empty — an empty hero with a €0,00 and a flat line is worse than
 * nothing, because it looks like a broken app rather than a new one.
 */
export function EmptyState() {
  const { openPosition } = useTransactionModal();

  return (
    <>
      <SiteHeader name="Get started" />
      <div className="pb-fade flex flex-1 items-center justify-center p-5">
        <div className="flex max-w-[560px] flex-col items-center gap-[18px] text-center">
          <span className="relative flex size-[88px] items-center justify-center">
            <span
              className="absolute inset-2 rounded-[26px] blur-[14px]"
              style={{
                background:
                  "linear-gradient(145deg,rgba(139,92,246,.22),rgba(247,147,26,.16))",
              }}
            />
            <span className="relative flex size-[62px] items-center justify-center rounded-[20px] border border-pb-strong bg-pb-raised">
              <TrendingUp size={28} strokeWidth={2} color="#F7931A" />
            </span>
          </span>

          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
            Know if you&rsquo;re up or down.
          </h1>
          <p className="max-w-[420px] text-[13px] text-pb-text-3 text-pretty">
            Add one position and Pebble starts tracking cost basis, P&amp;L and
            your sats stack. No accounts, no sync, no fees.
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick.symbol}
                type="button"
                onClick={() => openPosition(pick)}
                className="flex items-center gap-2 rounded-[10px] border border-pb-input bg-pb-surface px-3 py-[7px] transition-colors hover:border-pb-bright hover:bg-pb-raised"
              >
                <PbDot color={pick.color} size={7} />
                <span className="font-number text-[11.5px]">{pick.symbol}</span>
                <span className="truncate text-[11.5px] text-pb-muted">
                  {pick.type === "etf" ? "S&P 500" : pick.name}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openPosition()}
            className="h-9 rounded-[10px] bg-pb-accent px-[18px] text-[13px] font-semibold text-pb-accent-ink transition-[filter] hover:brightness-108"
            style={{ boxShadow: "0 10px 28px -14px #F7931A" }}
          >
            Add first position
          </button>

          <div className="mt-1 flex w-full flex-wrap justify-center gap-[22px] border-t border-[#1A1725] pt-[18px]">
            {STEPS.map((step, index) => (
              <div key={step.title} className="max-w-[150px] flex-1 text-left">
                <span className="block font-number text-[10px] text-pb-purple">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-0.5 block text-[12px] font-medium">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-pb-muted">
                  {step.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
