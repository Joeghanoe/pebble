import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Menu, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSyncStamp } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio";
import { usePreferences } from "@/lib/preferences";
import { useRefreshPrices } from "@/hooks/use-refresh-prices";
import { SidebarBody } from "@/frontend/components/pebble/Sidebar";
import {
  PbDot,
  PbGhostButton,
  PbPrimaryButton,
} from "@/frontend/components/pebble/primitives";
import { useTransactionModal } from "@/frontend/components/TransactionModalProvider";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * The topbar, on every screen.
 *
 * It stays put while the content scrolls, so the two things you always want —
 * how fresh the numbers are, and a way to log a transaction — never scroll away.
 */
export function SiteHeader({
  name,
  onBack,
  children,
}: {
  readonly name: string;
  /** Renders the back chevron. Position detail only. */
  readonly onBack?: boolean;
  readonly children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const { lastUpdated } = usePortfolio();
  const prefs = usePreferences();
  const { openTransaction } = useTransactionModal();
  const { refresh, refreshAuto, isPending, throttledUntil } = useRefreshPrices();

  // Auto-refresh is a preference, so the interval lives here rather than in the
  // query client: turning it off has to actually stop the polling.
  React.useEffect(() => {
    if (!prefs.autoRefresh) {
      return undefined;
    }
    const id = window.setInterval(
      () => refreshAuto(),
      prefs.refreshIntervalMinutes * 60_000,
    );
    return () => window.clearInterval(id);
  }, [prefs.autoRefresh, prefs.refreshIntervalMinutes, refreshAuto]);

  return (
    <header
      className="sticky top-0 z-20 flex h-[54px] shrink-0 items-center gap-2 border-b border-pb-subtle px-4 backdrop-blur-[12px] sm:px-5"
      style={{ background: "rgba(8,7,12,.85)" }}
    >
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-[7px] border border-pb-input text-pb-text-3 transition-colors hover:border-pb-bright hover:text-pb-text lg:hidden"
          >
            <Menu size={13} strokeWidth={2} />
            <span className="sr-only">Open navigation</span>
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[262px] border-pb-subtle p-3"
          style={{
            background: "linear-gradient(180deg,#0D0B12 0%,#0A0910 100%)",
          }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      {onBack && (
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="flex size-6 shrink-0 items-center justify-center rounded-[7px] border border-pb-input text-pb-text-3 transition-colors hover:border-pb-bright hover:text-pb-text"
        >
          <ChevronLeft size={13} strokeWidth={2} />
          <span className="sr-only">Back to dashboard</span>
        </button>
      )}

      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[14.5px] font-semibold">{name}</h1>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 md:flex">
          <PbDot color={lastUpdated ? "#34D399" : "#6F6885"} size={5} />
          <span className="font-number text-[11px] text-pb-faint">
            {lastUpdated ? `${formatSyncStamp(lastUpdated)}` : "no quotes"}
          </span>
        </span>
        {children}
        <PbGhostButton
          onClick={refresh}
          disabled={isPending}
          title={
            throttledUntil
              ? `Quotes were just pulled; retry after ${new Date(throttledUntil).toLocaleTimeString()}`
              : "Pull fresh quotes"
          }
        >
          <RotateCw
            size={13}
            strokeWidth={2}
            className={cn(isPending && "pb-spin")}
          />
          <span className="hidden sm:inline">Refresh</span>
        </PbGhostButton>
        <PbPrimaryButton onClick={() => openTransaction()}>
          <span className="text-[14px] leading-none">+</span>
          <span className="hidden sm:inline">Transaction</span>
        </PbPrimaryButton>
      </div>
    </header>
  );
}
