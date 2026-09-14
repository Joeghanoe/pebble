import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Plus, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortfolio } from "@/lib/portfolio";
import { usePreferences } from "@/lib/preferences";
import { formatBtc, formatPct, formatSats } from "@/lib/format";
import { PbDot } from "@/frontend/components/pebble/primitives";
import { pnlClass } from "@/frontend/components/pebble/pnl";
import { useTransactionModal } from "@/frontend/components/TransactionModalProvider";

/**
 * The sidebar's contents, independent of how it is mounted: a fixed rail on
 * desktop, the body of a sheet on a phone. `onNavigate` lets the sheet close
 * itself when a link inside it is followed.
 */
export function SidebarBody({
  onNavigate,
}: {
  readonly onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { positions, totalBtc, isLoading } = usePortfolio();
  const prefs = usePreferences();
  const { openPosition } = useTransactionModal();

  const currentAssetId = /^\/position\/(\d+)$/.exec(pathname)?.[1];

  return (
    <div className="flex flex-1 flex-col gap-[18px]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1.5 py-0.5 leading-[1.15]">
        <span className="flex size-7 shrink-0 items-center justify-center">
          <img
            src="/assets/images/app-icon.svg"
            alt="Pebble logo"
            className="h-4.5 w-4.5"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">Pebble</span>
        </span>
      </div>

      {/* Overview */}
      <nav className="flex flex-col">
        <SectionLabel>Overview</SectionLabel>
        <NavItem
          onNavigate={onNavigate}
          to="/"
          active={pathname === "/"}
          icon={<LayoutGrid size={15} strokeWidth={1.8} />}
        >
          Dashboard
        </NavItem>
        {/* <NavItem
          to="/get-started"
          onNavigate={onNavigate}
          active={pathname === "/get-started"}
          icon={<PlusCircle size={15} strokeWidth={1.8} />}
        >
          Get started
        </NavItem> */}
      </nav>

      {/* Positions */}
      <nav className="flex flex-col">
        <SectionLabel count={isLoading ? undefined : positions.length}>
          Positions
        </SectionLabel>
        {positions.map((position) => (
          <Link
            key={position.asset.id}
            to="/position/$assetId"
            params={{ assetId: String(position.asset.id) }}
            preload="intent"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-pb-nav-hover",
              currentAssetId === String(position.asset.id) &&
                "bg-pb-nav-active",
            )}
          >
            <PbDot color={position.color} />
            <span className="min-w-0 flex-1 truncate font-number text-[12px] font-medium">
              {position.asset.symbol}
            </span>
            <span
              className={cn(
                "font-number text-[11px] tabular-nums",
                pnlClass(position.pnl_pct),
              )}
            >
              {formatPct(position.pnl_pct, 1)}
            </span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openPosition();
          }}
          className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-pb-input px-2 py-1.5 text-[11.5px] text-pb-muted transition-colors hover:border-[rgba(247,147,26,.45)] hover:text-pb-accent"
        >
          <Plus size={13} strokeWidth={2} />
          Add position
        </button>
      </nav>

      {/* Bottom block */}
      <div className="mt-auto flex flex-col gap-2 border-t border-[#1A1725] pt-3">
        {prefs.denominateInBtc && totalBtc !== null && (
          <div
            className="rounded-[10px] p-2"
            style={{
              background:
                "linear-gradient(140deg,rgba(139,92,246,.14),rgba(139,92,246,.03))",
              border: "1px solid rgba(139,92,246,.18)",
            }}
          >
            <span className="block font-number text-[9.5px] tracking-[0.1em] text-pb-purple-label uppercase">
              Sats stack
            </span>
            <span className="block font-number text-[15px] font-medium tabular-nums">
              {formatSats(totalBtc)}
            </span>
            <span className="block text-[10.5px] text-pb-muted">
              sats · {formatBtc(totalBtc)} BTC
            </span>
          </div>
        )}
        <NavItem
          to="/settings"
          onNavigate={onNavigate}
          active={pathname === "/settings"}
          icon={<SlidersHorizontal size={15} strokeWidth={1.8} />}
        >
          Settings
        </NavItem>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  count,
}: {
  readonly children: React.ReactNode;
  readonly count?: number;
}) {
  return (
    <span className="flex items-baseline px-2 pb-1.5 font-number text-[9.5px] tracking-[0.12em] text-pb-faint uppercase">
      <span className="flex-1">{children}</span>
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}

function NavItem({
  to,
  active,
  icon,
  children,
  onNavigate,
}: {
  readonly to: string;
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
  readonly onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-[9px] px-2 py-[7px] text-[12px] font-medium transition-colors",
        active
          ? "bg-pb-nav-active text-pb-text"
          : "text-[#9E97B4] hover:bg-pb-nav-hover hover:text-pb-text",
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
