// src/frontend/components/pebble/primitives.tsx
//
// The small, repeated shapes of the Pebble UI. Everything here is presentational
// and unaware of the portfolio — screens compose these, the primitives never
// reach for a query.

import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Card ────────────────────────────────────────────────────────────────── */

/**
 * The card shell every panel sits in. `wash` paints the radial tint that the
 * hero cards carry: purple from the top-left on the dashboard, orange from the
 * top-right on a position, mirroring each other across the two screens.
 */
export function PbCard({
  className,
  wash,
  style,
  ...props
}: React.ComponentProps<"div"> & { wash?: "purple" | "orange" }) {
  const washes = {
    purple:
      "radial-gradient(120% 140% at 0% 0%, rgba(139,92,246,.13) 0%, rgba(19,17,24,0) 55%), #101017",
    orange:
      "radial-gradient(120% 140% at 100% 0%, rgba(247,147,26,.12) 0%, rgba(19,17,24,0) 55%), #101017",
  };
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-pb-line bg-pb-surface",
        className,
      )}
      style={wash ? { background: washes[wash], ...style } : style}
      {...props}
    />
  );
}

/** A card's title row: name, muted note, and whatever control sits on the right. */
export function PbCardHeader({
  title,
  note,
  children,
  className,
}: {
  readonly title: React.ReactNode;
  readonly note?: React.ReactNode;
  readonly children?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-[18px] py-3.5",
        className,
      )}
    >
      <h2 className="text-[12.5px] font-semibold">{title}</h2>
      {note && (
        <span className="font-number text-[10.5px] whitespace-nowrap text-pb-faint">
          {note}
        </span>
      )}
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}

/** The uppercase mono label above a value. */
export function PbEyebrow({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "font-number text-[10px] tracking-[0.13em] text-pb-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

/* ── Segmented control ───────────────────────────────────────────────────── */

/**
 * One control for the timeframe pills, the holdings class filter, the settings
 * choices and the modal's Buy/Sell switch. They differ only in typeface and
 * padding, so those are props rather than four near-identical components.
 */
export function PbSegmented<T extends string>({
  options,
  value,
  onChange,
  mono = true,
  className,
  itemClassName,
  activeStyle,
  grow = false,
}: {
  readonly options: readonly T[];
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly mono?: boolean;
  readonly className?: string;
  readonly itemClassName?: string;
  /** Per-option override for the active fill, used by Buy/Sell. */
  readonly activeStyle?: (option: T) => React.CSSProperties | undefined;
  readonly grow?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex shrink-0 flex-nowrap gap-0.5 self-start rounded-[10px] border border-pb-line bg-pb-raised p-[3px]",
        grow && "w-full",
        className,
      )}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            style={active ? activeStyle?.(option) : undefined}
            className={cn(
              "rounded-[7px] px-[9px] py-1 font-medium transition-colors",
              grow && "flex-1",
              mono ? "font-number text-[11px]" : "text-[11px]",
              active
                ? "bg-pb-segment-active text-pb-text"
                : "text-pb-muted hover:text-pb-text",
              itemClassName,
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

/** Orange. Only for actions that commit something. */
export function PbPrimaryButton({
  className,
  style,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] bg-pb-accent px-3 text-[12px] font-semibold text-pb-accent-ink transition-[filter] hover:brightness-108 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      style={{ boxShadow: "0 6px 18px -10px #F7931A", ...style }}
      {...props}
    />
  );
}

/** Outlined. Everything that does not commit. */
export function PbGhostButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] border border-pb-input px-[11px] text-[12px] font-medium text-pb-text-2 transition-colors hover:border-pb-bright hover:bg-[#14111D] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/* ── Toggle ──────────────────────────────────────────────────────────────── */

export function PbToggle({
  checked,
  onChange,
  label,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "h-[22px] w-[38px] shrink-0 rounded-[12px] border p-0.5 transition-colors duration-[180ms]",
        checked
          ? "border-pb-accent bg-pb-accent"
          : "border-pb-strong bg-[#1C1828]",
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full transition-transform duration-[180ms]",
          checked ? "translate-x-4 bg-pb-accent-ink" : "bg-pb-muted",
        )}
      />
    </button>
  );
}

/* ── Asset identity ──────────────────────────────────────────────────────── */

/** The rounded tile carrying an asset's first three letters. */
export function PbAssetTile({
  symbol,
  color,
  size = 30,
}: {
  readonly symbol: string;
  readonly color: string;
  readonly size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] font-number text-[10px] font-bold"
      style={{
        width: size,
        height: size,
        background: `${color}1A`,
        border: `1px solid ${color}33`,
        color,
      }}
    >
      {symbol.slice(0, 3).toUpperCase()}
    </span>
  );
}

export function PbClassPill({
  label,
  color,
}: {
  readonly label: string;
  readonly color: string;
}) {
  return (
    <span
      className="inline-block rounded-[5px] px-[7px] py-0.5 font-number text-[9.5px] tracking-[0.06em]"
      style={{ background: `${color}1A`, color }}
    >
      {label}
    </span>
  );
}

export function PbDot({
  color,
  size = 6,
}: {
  readonly color: string;
  readonly size?: number;
}) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

/* ── P&L ─────────────────────────────────────────────────────────────────── */

/** The tinted percentage badge beside a hero number. */
export function PbPnlBadge({
  value,
  children,
}: {
  readonly value: number;
  readonly children: React.ReactNode;
}) {
  const up = value >= 0;
  return (
    <span
      className="inline-block rounded-md border px-[7px] py-0.5 text-[11.5px] whitespace-nowrap"
      style={{
        background: up ? "rgba(52,211,153,.12)" : "rgba(248,113,113,.12)",
        borderColor: up ? "rgba(52,211,153,.22)" : "rgba(248,113,113,.22)",
        color: up ? "#34D399" : "#F87171",
      }}
    >
      {up ? "▲" : "▼"} {children}
    </span>
  );
}

/* ── Bars ────────────────────────────────────────────────────────────────── */

/** The 3px weight/allocation bar. */
export function PbBar({
  percent,
  color,
}: {
  readonly percent: number;
  readonly color: string;
}) {
  return (
    <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-pb-track">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          background: color,
        }}
      />
    </span>
  );
}

/* ── Stat tile ───────────────────────────────────────────────────────────── */

export function PbStatTile({
  eyebrow,
  value,
  caption,
  valueClassName,
  valueStyle,
}: {
  readonly eyebrow: string;
  readonly value: React.ReactNode;
  readonly caption?: React.ReactNode;
  readonly valueClassName?: string;
  readonly valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="flex flex-col gap-[5px] rounded-[13px] border border-pb-line bg-pb-surface px-3.5 py-[13px]">
      <span className="font-number text-[9.5px] tracking-[0.11em] text-pb-muted uppercase">
        {eyebrow}
      </span>
      <span
        className={cn(
          "font-number font-medium tracking-[-0.02em] whitespace-nowrap tabular-nums",
          valueClassName,
        )}
        style={{ fontSize: "clamp(13px, 1.5vw, 16px)", ...valueStyle }}
      >
        {value}
      </span>
      {caption && (
        <span className="text-[10.5px] text-pb-faint">{caption}</span>
      )}
    </div>
  );
}
