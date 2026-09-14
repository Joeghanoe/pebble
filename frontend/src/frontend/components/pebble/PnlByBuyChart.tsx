// src/frontend/components/pebble/PnlByBuyChart.tsx
import * as React from "react";
import { curve } from "@/lib/series";
import { formatPct } from "@/lib/format";
import { PbCard, PbCardHeader } from "./primitives";
import { pnlClass } from "./pnl";

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 150;
const PAD = 8;

export interface PnlByBuyPoint {
  date: string;
  /** Percent return of that buy at today's price. */
  pnl: number;
}

/**
 * Every open buy, measured against what that buy cost.
 *
 * The portfolio chart answers "how did the last month go". This answers a
 * different question — which of my purchases are actually in profit — and for
 * anyone buying the same asset repeatedly that is the one that decides whether
 * the next buy is averaging down or chasing.
 *
 * The zero line is the reference, not the bottom of the chart: the scale always
 * includes 0 so a series entirely in profit still shows how far above water it
 * sits. Fill is semantic and split at that line, green above and red below,
 * because a single colour crossing zero would say a losing buy and a winning
 * one are the same thing.
 *
 * Lots closed by a sell are left out. FIFO decides which those are, so what
 * remains is what you still hold.
 */
export function PbPnlByBuyChart({
  points,
}: {
  readonly points: readonly PnlByBuyPoint[];
}) {
  const uid = React.useId().replaceAll(":", "");
  const values = points.map((point) => point.pnl);

  const up = values.filter((value) => value > 0).length;
  const down = values.filter((value) => value < 0).length;

  // 0 is always in range, so the baseline never falls off the chart.
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const zeroY = PAD + (1 - (0 - min) / span) * (VIEW_HEIGHT - PAD * 2);

  const paths = curve(values, VIEW_WIDTH, VIEW_HEIGHT, PAD, [min, max]);

  return (
    <PbCard className="flex flex-col p-[18px]">
      <PbCardHeader
        className="mb-3.5 items-baseline p-0"
        title="Profit by buy"
        note="each open buy at today's price"
      >
        <div className="flex items-center gap-3 font-number text-[9.5px] text-pb-faint">
          <span className="text-pb-up">{up} up</span>
          <span className="text-pb-down">{down} down</span>
        </div>
      </PbCardHeader>

      {paths === null ? (
        <p className="py-6 text-center text-[11.5px] text-pb-faint">
          A second buy is needed before there is a shape to compare.
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            className="block h-[132px] w-full"
            role="img"
            aria-label={`Return of each open buy: ${up} in profit, ${down} at a loss`}
          >
            <defs>
              {/* Clip the same area to the two sides of the zero line so one
                  path can carry two meanings without drawing it twice. */}
              <clipPath id={`pbAbove-${uid}`}>
                <rect x="0" y="0" width={VIEW_WIDTH} height={zeroY} />
              </clipPath>
              <clipPath id={`pbBelow-${uid}`}>
                <rect
                  x="0"
                  y={zeroY}
                  width={VIEW_WIDTH}
                  height={Math.max(VIEW_HEIGHT - zeroY, 0)}
                />
              </clipPath>
            </defs>

            {/* Area between the line and zero, rather than down to the floor. */}
            <path
              d={`${paths.line} L${VIEW_WIDTH},${zeroY} L0,${zeroY} Z`}
              fill="#34D399"
              fillOpacity={0.18}
              clipPath={`url(#pbAbove-${uid})`}
            />
            <path
              d={`${paths.line} L${VIEW_WIDTH},${zeroY} L0,${zeroY} Z`}
              fill="#F87171"
              fillOpacity={0.18}
              clipPath={`url(#pbBelow-${uid})`}
            />

            <line
              x1="0"
              y1={zeroY}
              x2={VIEW_WIDTH}
              y2={zeroY}
              stroke="#3A3350"
              strokeWidth={1.4}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />

            <path
              d={paths.line}
              fill="none"
              stroke="#34D399"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#pbAbove-${uid})`}
            />
            <path
              d={paths.line}
              fill="none"
              stroke="#F87171"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#pbBelow-${uid})`}
            />
          </svg>

          <div className="mt-1.5 flex items-center justify-between gap-2 font-number text-[10px] text-pb-faintest">
            <span>{points[0].date}</span>
            <span className="truncate">return per buy · break-even ┄</span>
            <span>{points[points.length - 1].date}</span>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-pb-hairline pt-3">
            <Stat label="Best buy" value={Math.max(...values)} />
            <Stat label="Worst buy" value={Math.min(...values)} />
            <Stat
              label="Median"
              value={
                [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
              }
            />
          </div>
        </>
      )}
    </PbCard>
  );
}

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div>
      <span className="block font-number text-[9.5px] tracking-[0.11em] text-pb-muted uppercase">
        {label}
      </span>
      <span
        className={`mt-0.5 block font-number text-[15px] font-medium tabular-nums ${pnlClass(value)}`}
      >
        {formatPct(value)}
      </span>
    </div>
  );
}
