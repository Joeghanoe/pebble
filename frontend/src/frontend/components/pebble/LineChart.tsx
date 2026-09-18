// src/frontend/components/pebble/LineChart.tsx
import * as React from "react";
import { curve, scaleX, scaleY, sharedDomain } from "@/lib/series";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pnlClass } from "./pnl";

export interface LineChartProps {
  /** The series that owns the gradient fill and the draw-on. */
  readonly values: readonly number[];
  /** A dashed reference drawn on the same scale: benchmark, or average cost. */
  readonly reference?: readonly number[];
  readonly height: number;
  readonly viewBoxHeight: number;
  /** Gradient and stroke. The dashboard runs purple→orange, a position is orange. */
  readonly variant: "portfolio" | "position";
  readonly startLabel: string;
  readonly endLabel: string;
  readonly legend: string;
  readonly emptyMessage?: string;
  /**
   * One date per value. Supplying these turns on the hover readout — without
   * them there is nothing to title a reading with, so the chart stays static.
   */
  readonly dates?: readonly string[];
  readonly formatValue?: (value: number) => string;
  readonly seriesLabel?: string;
  readonly referenceLabel?: string;
  /**
   * What the gap between the two lines is called in the readout. Only shown
   * when there is a reference to measure against.
   */
  readonly deltaLabel?: string;
}

const WIDTH = 640;
const PAD = 6;

/**
 * A shape, not a chart: no axes, no gridlines, and end labels instead of ticks.
 * It answers "which way has this gone" at a glance, and the exact figures live
 * in the numerals above it.
 *
 * Hovering adds the one thing those numerals cannot give you — what the lines
 * were worth on a particular day. The readout is opt-in via `dates` rather than
 * always on, because a chart with no dates behind it has nothing to say.
 *
 * The gradient ids are made unique per instance — two of these render on the
 * same document and SVG defs are global, so a fixed id would let whichever
 * mounted first own the fill for both.
 */
export function PbLineChart({
  values,
  reference,
  height,
  viewBoxHeight,
  variant,
  startLabel,
  endLabel,
  legend,
  emptyMessage = "Not enough history yet",
  dates,
  formatValue,
  seriesLabel = "price",
  referenceLabel = "avg cost",
  deltaLabel = "P&L",
}: LineChartProps) {
  const uid = React.useId().replaceAll(":", "");
  const [active, setActive] = React.useState<number | null>(null);

  const domain = sharedDomain(values, reference ?? []);
  const main = curve(values, WIDTH, viewBoxHeight, PAD, domain);
  const ref = reference
    ? curve(reference, WIDTH, viewBoxHeight, PAD, domain)
    : null;

  if (!main) {
    return (
      <div
        className="mt-2 flex items-center justify-center text-[11.5px] text-pb-faint"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const areaColor = variant === "portfolio" ? "#8B5CF6" : "#F7931A";
  const areaOpacity = variant === "portfolio" ? 0.28 : 0.22;
  const mainColor = variant === "portfolio" ? "#8B5CF6" : "#F7931A";
  const refColor = variant === "portfolio" ? "#3A3350" : "#8B5CF6";

  const hoverable = dates !== undefined && dates.length === values.length;
  const format = formatValue ?? ((value: number) => value.toFixed(2));

  /** Nearest point to the pointer, in fractions of the box rather than pixels. */
  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) {
      return;
    }
    const fraction = (event.clientX - box.left) / box.width;
    const index = Math.round(fraction * (values.length - 1));
    setActive(Math.min(values.length - 1, Math.max(0, index)));
  }

  /**
   * The crosshair in fractions of the box, not viewBox units.
   *
   * It is drawn in the DOM rather than in the SVG for two reasons. The box is
   * stretched (`preserveAspectRatio="none"`), so an SVG circle would render as
   * an ellipse; and the newest point sits at x = WIDTH exactly, where the
   * viewBox clips half of any mark placed on it — which is why the reading for
   * today had no dot. A DOM overlay is free to overflow into the card padding.
   */
  const marker =
    active === null || !domain
      ? null
      : {
          x: scaleX(active, values.length, WIDTH) / WIDTH,
          y: scaleY(values[active], viewBoxHeight, PAD, domain) / viewBoxHeight,
          refY:
            reference && reference[active] !== undefined
              ? scaleY(reference[active], viewBoxHeight, PAD, domain) /
                viewBoxHeight
              : null,
        };

  return (
    <>
      <div
        className="relative mt-2"
        style={{ height }}
        onPointerMove={hoverable ? handleMove : undefined}
        onPointerLeave={hoverable ? () => setActive(null) : undefined}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${viewBoxHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="relative z-[1] block h-full w-full"
        >
          <defs>
            <linearGradient id={`pbArea-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={areaColor}
                stopOpacity={areaOpacity}
              />
              <stop offset="100%" stopColor={areaColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`pbLine-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#F7931A" />
            </linearGradient>
          </defs>

          <path d={main.area} fill={`url(#pbArea-${uid})`} />
          {ref && (
            <path
              d={ref.line}
              fill="none"
              stroke={refColor}
              strokeWidth={1.4}
              strokeDasharray={variant === "portfolio" ? "3 4" : "4 5"}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            className="pb-draw"
            d={main.line}
            fill="none"
            stroke={variant === "portfolio" ? `url(#pbLine-${uid})` : mainColor}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {marker && (
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <span
              className="absolute top-0 bottom-0 w-px bg-pb-strong"
              style={{ left: `${marker.x * 100}%` }}
            />
            {marker.refY !== null && (
              <Dot
                x={marker.x}
                y={marker.refY}
                size={6}
                color={variant === "portfolio" ? "#8E88A0" : "#8B5CF6"}
              />
            )}
            <Dot
              x={marker.x}
              y={marker.y}
              size={7}
              color={mainColor}
              ring="#08070C"
            />
          </div>
        )}

        {hoverable && active !== null && (
          <Readout
            fraction={values.length === 1 ? 0 : active / (values.length - 1)}
            date={dates[active]}
            rows={[
              {
                label: seriesLabel,
                value: format(values[active]),
                color: mainColor,
              },
              ...(reference && reference[active] !== undefined
                ? [
                    {
                      label: referenceLabel,
                      value: format(reference[active]),
                      color: variant === "portfolio" ? "#8E88A0" : "#8B5CF6",
                    },
                  ]
                : []),
            ]}
            delta={delta(
              values[active],
              reference?.[active],
              format,
              deltaLabel,
            )}
          />
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 font-number text-[10px] text-pb-faintest">
        <span>{startLabel}</span>
        <span className="truncate">{legend}</span>
        <span>{endLabel}</span>
      </div>
    </>
  );
}

/**
 * The gap between the two lines on the hovered day, in currency and in percent.
 *
 * The lines already show which is on top; what they cannot show is by how much,
 * and a gap that looks the same at either end of a rising chart is rarely the
 * same return. Percent is measured against the reference — profit over what was
 * put in, the same base the cards use — so the reading matches the headline
 * when you hover the newest point.
 *
 * Null without a reference, and at a reference of zero: there is no return on
 * nothing, and dividing by it would print Infinity.
 */
function delta(
  value: number,
  against: number | undefined,
  format: (value: number) => string,
  label: string,
): DeltaReading | null {
  if (against === undefined || against === 0) {
    return null;
  }
  const difference = value - against;
  return {
    label,
    amount: format(difference),
    pct: formatPct((difference / Math.abs(against)) * 100),
    tone: pnlClass(difference),
  };
}

interface DeltaReading {
  readonly label: string;
  readonly amount: string;
  readonly pct: string;
  readonly tone: string;
}

/** A round mark on the crosshair, sized in pixels so the stretch cannot flatten it. */
function Dot({
  x,
  y,
  size,
  color,
  ring,
}: {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly ring?: string;
}) {
  return (
    <span
      className="absolute block rounded-full"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        background: color,
        boxShadow: ring ? `0 0 0 1.5px ${ring}` : undefined,
      }}
    />
  );
}

/**
 * The hovered reading, pinned to the crosshair.
 *
 * It slides with the pointer but flips to the other side past halfway, so it
 * never runs off the card and never covers the part of the line you are
 * pointing at. `pointer-events-none` keeps it from stealing the move events
 * that position it.
 */
function Readout({
  fraction,
  date,
  rows,
  delta,
}: {
  readonly fraction: number;
  readonly date: string;
  readonly rows: readonly { label: string; value: string; color: string }[];
  readonly delta?: DeltaReading | null;
}) {
  const flip = fraction > 0.5;
  return (
    <div
      className="pointer-events-none absolute top-1 z-[2] min-w-[132px] rounded-[9px] border border-pb-strong bg-pb-modal px-2.5 py-2"
      style={{
        left: `${fraction * 100}%`,
        transform: `translateX(${flip ? "calc(-100% - 10px)" : "10px"})`,
        boxShadow: "0 12px 28px -14px rgba(0,0,0,.9)",
      }}
    >
      <span className="block font-number text-[9.5px] text-pb-faint">
        {date}
      </span>
      {rows.map((row) => (
        <span
          key={row.label}
          className="mt-1 flex items-baseline justify-between gap-3"
        >
          <span className="flex items-center gap-1.5 text-[10.5px] whitespace-nowrap text-pb-text-3">
            <span
              className="block size-1.5 shrink-0 rounded-full"
              style={{ background: row.color }}
            />
            {row.label}
          </span>
          <span className="font-number text-[11.5px] whitespace-nowrap tabular-nums">
            {row.value}
          </span>
        </span>
      ))}
      {delta && (
        // Ruled off rather than listed as a third line: it is derived from the
        // two above, not another series.
        <span className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-pb-hairline pt-1.5">
          <span className="text-[10.5px] whitespace-nowrap text-pb-text-3">
            {delta.label}
          </span>
          <span
            className={cn(
              "font-number text-[11.5px] whitespace-nowrap tabular-nums",
              delta.tone,
            )}
          >
            {delta.amount} · {delta.pct}
          </span>
        </span>
      )}
    </div>
  );
}
