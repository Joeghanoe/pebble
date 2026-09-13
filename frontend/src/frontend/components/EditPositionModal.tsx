import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Asset, Exchange } from "@/types/db";
import { PbGhostButton, PbSegmented } from "./pebble/primitives";

interface Props {
  readonly asset: Asset;
  readonly exchanges: Exchange[];
}

const TYPES = ["Crypto", "ETF", "Stock", "Cash"] as const;
const TYPE_VALUES: Record<(typeof TYPES)[number], Asset["type"]> = {
  Crypto: "crypto",
  ETF: "etf",
  Stock: "stock",
  Cash: "cash",
};

/**
 * Corrects an existing asset — most often a price-feed identity that was wrong
 * or missing, which is why the position shows a cost basis and no live quote.
 */
export function EditPositionModal({ asset, exchanges }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title="Edit position"
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-pb-input text-pb-text-3 transition-colors hover:border-pb-bright hover:text-pb-text"
        >
          <Pencil size={13} />
        </button>
      </Dialog.Trigger>
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
          {/* Radix unmounts the content while closed, so the form seeds itself
              from the asset on each open rather than in an effect. */}
          <EditForm
            asset={asset}
            exchanges={exchanges}
            onClose={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditForm({
  asset,
  exchanges,
  onClose,
}: {
  readonly asset: Asset;
  readonly exchanges: Exchange[];
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = React.useState<(typeof TYPES)[number]>(
    () =>
      (Object.keys(TYPE_VALUES) as (typeof TYPES)[number][]).find(
        (key) => TYPE_VALUES[key] === asset.type,
      ) ?? "Crypto",
  );
  const [symbol, setSymbol] = React.useState(asset.symbol);
  const [name, setName] = React.useState(asset.name);
  const [exchangeId, setExchangeId] = React.useState(asset.exchange_id);
  const [yahooTicker, setYahooTicker] = React.useState(
    asset.yahoo_ticker ?? "",
  );
  const [coingeckoId, setCoingeckoId] = React.useState(
    asset.coingecko_id ?? "",
  );
  const [error, setError] = React.useState<string | null>(null);

  const assetType = TYPE_VALUES[type];
  const available =
    assetType === "crypto"
      ? exchanges.filter((e) => e.type === "crypto")
      : exchanges.filter((e) => e.type === "broker" || e.type === "manual");

  const updatePosition = useMutation({
    mutationFn: (body: Parameters<typeof api.updateAsset>[1]) =>
      api.updateAsset(asset.id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Position updated.");
      onClose();
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not update that position.")),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!symbol.trim() || !name.trim()) {
      setError("A symbol and a name are required.");
      return;
    }
    setError(null);
    updatePosition.mutate({
      symbol: symbol.trim().toUpperCase(),
      name: name.trim(),
      type: assetType,
      exchangeId,
      yahooTicker: yahooTicker.trim() || null,
      coingeckoId: coingeckoId.trim() || null,
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
          Edit position
        </Dialog.Title>
        <span className="font-number text-[10.5px] text-pb-faint">
          {asset.symbol}
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
          onChange={setType}
          itemClassName="py-1.5 text-[12px] font-semibold"
        />

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Symbol</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className={cn(input, "font-number uppercase")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Held at</span>
            <select
              value={exchangeId}
              onChange={(event) => setExchangeId(Number(event.target.value))}
              className={cn(input, "cursor-pointer")}
            >
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
            className={input}
          />
        </label>

        {assetType === "crypto" && (
          <label className="flex flex-col gap-1.5">
            <span className={label}>CoinGecko ID</span>
            <input
              value={coingeckoId}
              onChange={(event) => setCoingeckoId(event.target.value)}
              placeholder="bitcoin"
              className={cn(input, "font-number")}
            />
            <span className="text-[10.5px] text-pb-faint">
              The lowercase slug from the coin&rsquo;s CoinGecko URL.
            </span>
          </label>
        )}

        {(assetType === "etf" || assetType === "stock") && (
          <label className="flex flex-col gap-1.5">
            <span className={label}>Yahoo ticker</span>
            <input
              value={yahooTicker}
              onChange={(event) => setYahooTicker(event.target.value)}
              placeholder="VUAA.AS"
              className={cn(input, "font-number")}
            />
            <span className="text-[10.5px] text-pb-faint">
              Include the exchange suffix: .AS Amsterdam, .DE Xetra, .L London,
              .PA Paris.
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
            disabled={updatePosition.isPending}
            className="h-[34px] flex-1 rounded-[9px] bg-pb-accent text-[12.5px] font-semibold text-pb-accent-ink transition-[filter] hover:brightness-108 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatePosition.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </>
  );
}
