import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { usePortfolio, type HoldingRow } from "@/lib/portfolio";
import { usePreferences } from "@/lib/preferences";
import { formatEur, formatEurPrice, formatUnits } from "@/lib/format";
import { PbDot, PbGhostButton, PbSegmented } from "./pebble/primitives";

type Side = "Buy" | "Sell";

const PRESETS = [100, 250, 500, 1000];

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Preselected asset. Falls back to the largest position. */
  readonly assetId?: number;
}

/**
 * The transaction dialog.
 *
 * It is spend-led rather than quantity-led: you remember paying €250, not
 * receiving 0,00218 BTC, so the amount drives and the quantity is derived from
 * the live unit price. The derived quantity stays editable, because a ledger has
 * to record the fill you actually got — deriving from the *current* quote and
 * saving it silently would book the wrong cost basis on any day the price moved.
 */
export function AddTransactionModal({ open, onOpenChange, assetId }: Props) {
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
          {/* Radix unmounts the content while closed, so the form below starts
              from its initial state on every open. Reopening is a fresh entry:
              an amount left over from the last one is a hazard, not a
              convenience. */}
          <TransactionForm
            assetId={assetId}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TransactionForm({
  assetId,
  onClose,
}: {
  readonly assetId?: number;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { positions } = usePortfolio();
  const prefs = usePreferences();

  const [side, setSide] = React.useState<Side>("Buy");
  const [selectedId, setSelectedId] = React.useState<number | undefined>(
    assetId,
  );
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [spend, setSpend] = React.useState("250");
  const [unitsOverride, setUnitsOverride] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const position: HoldingRow | undefined =
    positions.find((p) => p.asset.id === selectedId) ?? positions[0];

  const unitPrice = position?.unitPrice ?? null;
  const spendValue = Number.parseFloat(spend.replace(",", "."));
  const spendIsValid = Number.isFinite(spendValue) && spendValue > 0;

  const derivedUnits =
    spendIsValid && unitPrice && unitPrice > 0 ? spendValue / unitPrice : 0;
  const units =
    unitsOverride === null
      ? derivedUnits
      : Number.parseFloat(unitsOverride.replace(",", ".")) || 0;

  const newAverage =
    position && units > 0
      ? side === "Buy"
        ? (position.total_invested_eur + spendValue) /
          (position.units_held + units)
        : position.units_held - units > 0
          ? position.total_invested_eur / position.units_held
          : 0
      : null;

  const createTx = useMutation({
    mutationFn: (body: Parameters<typeof api.createTransaction>[0]) =>
      api.createTransaction(body),
    onSuccess: () => {
      if (position) {
        void queryClient.invalidateQueries({
          queryKey: ["transactions", position.asset.id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["position-history", position.asset.id],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      toast.success("Transaction saved.");
      onClose();
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not save that transaction.")),
  });

  /** Everything that must hold before the ledger is touched. */
  function validate(): string | null {
    if (!position) {
      return "Add a position before logging a transaction.";
    }
    if (!spendIsValid) {
      return "Enter an amount greater than zero.";
    }
    if (units <= 0) {
      return unitPrice
        ? "Enter a quantity greater than zero."
        : `No live price for ${position.asset.symbol} — enter the quantity by hand.`;
    }
    if (date > new Date().toISOString().slice(0, 10)) {
      return "That date is in the future.";
    }
    if (side === "Sell" && units > position.units_held) {
      return `You hold ${formatUnits(position.units_held, prefs.fullPrecision)} ${position.asset.symbol}.`;
    }
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem || !position) {
      return;
    }
    createTx.mutate({
      assetId: position.asset.id,
      date,
      type: side === "Buy" ? "buy" : "sell",
      units,
      eurAmount: spendValue,
    });
  }

  const label =
    "font-number text-[10px] tracking-[0.11em] text-pb-muted uppercase";
  const field =
    "flex h-[34px] items-center gap-2 rounded-[9px] border border-pb-input bg-pb-raised px-2.5";

  return (
    <>
      <div className="flex items-center gap-2 border-b border-pb-subtle px-[18px] py-[15px]">
        <Dialog.Title className="text-[13.5px] font-semibold">
          {side === "Sell" ? "Sell" : "Add"} transaction
        </Dialog.Title>
        <span className="font-number text-[10.5px] text-pb-faint">
          {position?.asset.symbol ?? "—"}
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
          options={["Buy", "Sell"] as const}
          value={side}
          onChange={setSide}
          itemClassName="py-1.5 text-[12px] font-semibold"
          activeStyle={(option) =>
            option === "Buy"
              ? { background: "rgba(52,211,153,.14)", color: "#34D399" }
              : { background: "rgba(248,113,113,.14)", color: "#F87171" }
          }
        />

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Asset</span>
            <span className={cn(field, "relative")}>
              {position && <PbDot color={position.color} />}
              <span className="min-w-0 flex-1 truncate font-number text-[12px]">
                {position?.asset.symbol ?? "No positions"}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={2.2}
                className="text-pb-faintest"
              />
              <select
                aria-label="Asset"
                value={position?.asset.id ?? ""}
                onChange={(event) => {
                  setSelectedId(Number(event.target.value));
                  setUnitsOverride(null);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                {positions.map((option) => (
                  <option key={option.asset.id} value={option.asset.id}>
                    {option.asset.symbol} — {option.asset.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={label}>Date</span>
            <input
              type="date"
              // A native date input renders in the browser's locale, which
              // would print 09/13/2026 beside a ledger of ISO dates. en-CA
              // is the locale whose short date *is* ISO.
              lang="en-CA"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDate(event.target.value)}
              className={cn(
                field,
                "w-full font-number text-[12px] outline-none",
              )}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={label}>
            Amount {side === "Sell" ? "received" : "spent"} (€)
          </span>
          <input
            inputMode="decimal"
            value={spend}
            onChange={(event) => {
              setSpend(event.target.value);
              setUnitsOverride(null);
            }}
            className="h-11 rounded-[10px] border border-pb-strong bg-pb-raised px-3 font-number text-[20px] font-medium text-pb-text outline-none focus:border-[rgba(247,147,26,.55)]"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setSpend(String(preset));
                setUnitsOverride(null);
              }}
              className="rounded-[7px] border border-pb-input bg-pb-raised px-2.5 py-1 font-number text-[11px] text-pb-text-3 transition-colors hover:border-[rgba(247,147,26,.4)] hover:text-pb-accent"
            >
              {formatEur(preset).replace(",00", "")}
            </button>
          ))}
        </div>

        {/* Live summary. Recomputes on every keystroke and preset click. */}
        <div
          className="rounded-[11px] border border-pb-strong px-3.5 py-3"
          style={{
            background:
              "linear-gradient(135deg,rgba(139,92,246,.1),rgba(247,147,26,.06))",
          }}
        >
          <SummaryRow label="Unit price">
            {unitPrice === null ? "—" : formatEurPrice(unitPrice)}
          </SummaryRow>
          <SummaryRow label={side === "Sell" ? "You sell" : "You receive"}>
            <span className="inline-flex items-baseline gap-1">
              <input
                aria-label="Quantity"
                inputMode="decimal"
                value={
                  unitsOverride ??
                  (derivedUnits > 0
                    ? derivedUnits.toFixed(derivedUnits < 1 ? 8 : 4)
                    : "")
                }
                onChange={(event) => setUnitsOverride(event.target.value)}
                placeholder="0"
                className="w-[11ch] bg-transparent text-right font-number text-[11.5px] text-pb-accent outline-none focus:underline"
              />
              <span className="text-pb-accent">
                {position?.asset.symbol ?? ""}
              </span>
            </span>
          </SummaryRow>
          <div className="mt-1.5 border-t border-pb-line pt-[7px]">
            <SummaryRow label="New avg cost">
              {newAverage === null ? "—" : formatEurPrice(newAverage)}
            </SummaryRow>
          </div>
        </div>

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
            disabled={createTx.isPending || !position}
            className="h-[34px] flex-1 rounded-[9px] bg-pb-accent text-[12.5px] font-semibold text-pb-accent-ink transition-[filter] hover:brightness-108 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createTx.isPending ? "Saving…" : "Save transaction"}
          </button>
        </div>
      </form>
    </>
  );
}

function SummaryRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[11.5px]">
      <span className="text-pb-text-3">{label}</span>
      <span className="font-number whitespace-nowrap tabular-nums">
        {children}
      </span>
    </div>
  );
}
