// src/frontend/components/pebble/LineChart.tsx
import * as React from "react";
import { curve, sharedDomain } from "@/lib/series";

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
}

const WIDTH = 640;

/**
 * A shape, not a chart: no axes, no gridlines, no tooltip, and end labels instead
 * of ticks. It answers "which way has this gone" at a glance, and the exact
 * figures live in the numerals above it.
 *
 * The gradient ids are made unique per instance — two of these render on the same
 * document and SVG defs are global, so a fixed id would let whichever mounted
 * first own the fill for both.
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
}: LineChartProps) {
  const uid = React.useId().replaceAll(":", "");
  const domain = sharedDomain(values, reference ?? []);
  const main = curve(values, WIDTH, viewBoxHeight, 6, domain);
  const ref = reference
    ? curve(reference, WIDTH, viewBoxHeight, 6, domain)
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

  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="relative z-[1] mt-2 block w-full"
        style={{ height }}
      >
        <defs>
          <linearGradient id={`pbArea-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaColor} stopOpacity={areaOpacity} />
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
            stroke={variant === "portfolio" ? "#3A3350" : "#8B5CF6"}
            strokeWidth={1.4}
            strokeDasharray={variant === "portfolio" ? "3 4" : "4 5"}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          className="pb-draw"
          d={main.line}
          fill="none"
          stroke={variant === "portfolio" ? `url(#pbLine-${uid})` : "#F7931A"}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1.5 flex items-center justify-between gap-2 font-number text-[10px] text-pb-faintest">
        <span>{startLabel}</span>
        <span className="truncate">{legend}</span>
        <span>{endLabel}</span>
      </div>
    </>
  );
}
