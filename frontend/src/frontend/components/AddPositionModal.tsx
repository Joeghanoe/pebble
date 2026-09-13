import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Exchange, Asset } from "@/types/db";
import { PbGhostButton, PbSegmented } from "./pebble/primitives";

type AssetType = Asset["type"];

/** A quick pick from the empty state, or nothing for a blank form. */
export interface PositionPrefill {
  symbol: string;
  name: string;
  type: AssetType;
  coingeckoId?: string;
  yahooTicker?: string;
}

const TYPES = ["Crypto", "ETF", "Stock", "Cash"] as const;
const TYPE_VALUES: Record<(typeof TYPES)[number], AssetType> = {
  Crypto: "crypto",
  ETF: "etf",
  Stock: "stock",
  Cash: "cash",
};

/** Crypto lives on an exchange; everything else on a broker or a manual book. */
function eligibleExchanges(type: AssetType, exchanges: Exchange[]): Exchange[] {
  if (type === "crypto") {
    return exchanges.filter((e) => e.type === "crypto");
  }
  const filtered = exchanges.filter(
    (e) => e.type === "broker" || e.type === "manual",
  );
  return filtered.length > 0 ? filtered : exchanges;
}

const PLACEHOLDERS: Record<AssetType, { symbol: string; name: string }> = {
  crypto: { symbol: "BTC", name: "Bitcoin" },
  etf: { symbol: "VUAA", name: "Vanguard S&P 500 UCITS ETF" },
  stock: { symbol: "AAPL", name: "Apple Inc." },
  cash: { symbol: "EUR", name: "Cash" },
};

/**
 * Creates the asset a transaction is later logged against.
 *
 * The price-feed identity is what makes this its own step: without a CoinGecko
 * slug or a Yahoo ticker the position exists but never gets a quote, so the
 * field sits in the form rather than behind an "advanced" disclosure.
 */
export function AddPositionModal({
  open,
  onOpenChange,
  exchanges,
  prefill,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly exchanges: Exchange[];
  readonly prefill?: PositionPrefill;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 backdrop-blur-[6px]"
          style={{ background: "rgba(5,4,9,.72)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="pb-pop fixed top-1/2 left-1/2 z-50 w-[calc(100vw-48px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px] border border-pb-strong bg-pb-modal"
          style={{ boxShadow: "0 40px 90px -30px rgba(0,0,0,.9)" }}
        >
          {/* Radix unmounts the content while closed, so the quick pick seeds
              the form through its initial state rather than an effect that has
              to undo the last entry. */}
          <PositionForm
            exchanges={exchanges}
            prefill={prefill}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PositionForm({
  exchanges,
  prefill,
  onClose,
}: {
  readonly exchanges: Exchange[];
  readonly prefill?: PositionPrefill;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = React.useState<(typeof TYPES)[number]>(
    () =>
      (Object.keys(TYPE_VALUES) as (typeof TYPES)[number][]).find(
        (key) => TYPE_VALUES[key] === (prefill?.type ?? "crypto"),
      ) ?? "Crypto",
  );
  const [symbol, setSymbol] = React.useState(prefill?.symbol ?? "");
  const [name, setName] = React.useState(prefill?.name ?? "");
  const [feedId, setFeedId] = React.useState(
    prefill?.coingeckoId ?? prefill?.yahooTicker ?? "",
  );
  const [exchangeId, setExchangeId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const assetType = TYPE_VALUES[type];
  const available = eligibleExchanges(assetType, exchanges);

  // Follows the type until the user picks one, then stays put.
  const selectedExchange = exchangeId ?? available[0]?.id ?? null;

  const createPosition = useMutation({
    mutationFn: (body: Parameters<typeof api.createAsset>[0]) =>
      api.createAsset(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success(`${symbol.toUpperCase()} added.`);
      onClose();
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not add that position.")),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!symbol.trim() || !name.trim()) {
      setError("A symbol and a name are required.");
      return;
    }
    if (selectedExchange === null) {
      setError(
        `No ${assetType === "crypto" ? "crypto exchange" : "broker"} to file this under. Add one in Settings first.`,
      );
      return;
    }
    setError(null);
    createPosition.mutate({
      symbol: symbol.trim().toUpperCase(),
      name: name.trim(),
      type: assetType,
      exchangeId: selectedExchange,
      coingeckoId:
        assetType === "crypto" ? feedId.trim() || undefined : undefined,
      yahooTicker:
        assetType === "etf" || assetType === "stock"
          ? feedId.trim() || undefined
          : undefined,
    });
  }

  const label =
    "font-number text-[10px] tracking-[0.11em] text-pb-muted uppercase";
  const input =
    "h-[34px] rounded-[9px] border border-pb-input bg-pb-raised px-2.5 text-[12px] text-pb-text outline-none focus:border-[rgba(247,147,26,.55)]";

  return (
    <>
      <div className="flex items-center gap-2 border-b border-pb-subtle px-[18px] py-[15px]">
        <Dialog.Title className="text-[13.5px] font-semibold">
          Add position
        </Dialog.Title>
        <span className="font-number text-[10.5px] text-pb-faint">
          {symbol.toUpperCase() || "new asset"}
        </span>
        <Dialog.Close className="ml-auto flex size-6 items-center justify-center rounded-md text-pb-muted transition-colors hover:bg-[#1A1725] hover:text-pb-text">
          <X size={13} strokeWidth={2} />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-[18px]">
        <PbSegmented
          grow
          mono={false}
          options={TYPES}
          value={type}
          onChange={(next) => {
            setType(next);
            setExchangeId(null);
            setFeedId("");
          }}
          itemClassName="py-1.5 text-[12px] font-semibold"
        />

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Symbol</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder={PLACEHOLDERS[assetType].symbol}
              className={cn(input, "font-number uppercase")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Held at</span>
            <select
              value={selectedExchange ?? ""}
              onChange={(event) => setExchangeId(Number(event.target.value))}
              className={cn(input, "cursor-pointer")}
            >
              {available.length === 0 && <option value="">None yet</option>}
              {available.map((exchange) => (
                <option key={exchange.id} value={exchange.id}>
                  {exchange.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={PLACEHOLDERS[assetType].name}
            className={input}
          />
        </label>

        {assetType !== "cash" && (
          <label className="flex flex-col gap-1.5">
            <span className={label}>
              {assetType === "crypto" ? "CoinGecko ID" : "Yahoo ticker"}
            </span>
            <input
              value={feedId}
              onChange={(event) => setFeedId(event.target.value)}
              placeholder={assetType === "crypto" ? "bitcoin" : "VUAA.L"}
              className={cn(input, "font-number")}
            />
            <span className="text-[10.5px] text-pb-faint">
              Without it the position tracks its cost basis but never gets a
              live quote.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="text-[11.5px] text-pb-down">
            {error}
          </p>
        )}

        <div className="-mx-[18px] -mb-[18px] mt-0.5 flex gap-2.5 border-t border-pb-subtle bg-pb-modal-foot px-[18px] py-3.5">
          <PbGhostButton className="h-[34px] px-3.5" onClick={onClose}>
            Cancel
          </PbGhostButton>
          <button
            type="submit"
            disabled={createPosition.isPending}
            className="h-[34px] flex-1 rounded-[9px] bg-pb-accent text-[12.5px] font-semibold text-pb-accent-ink transition-[filter] hover:brightness-108 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createPosition.isPending ? "Adding…" : "Add position"}
          </button>
        </div>
      </form>
    </>
  );
}
