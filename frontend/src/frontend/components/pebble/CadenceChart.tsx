// src/frontend/components/pebble/CadenceChart.tsx
import { describeCadence, type Cadence } from "@/lib/cadence";
import { edgeLabel } from "@/lib/series";
import { PbCard, PbCardHeader } from "./primitives";

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 120;

/**
 * How consistently money went into a position, and where it stopped.
 *
 * One bar per buy, in order, its height the gap since the previous one. A row
 * of even bars is a habit kept; a spike is a month skipped. The dashed line is
 * the usual rhythm, so "consistent" reads as bars sitting on it rather than as
 * a judgement the chart has to spell out.
 *
 * Purple throughout, per the accent contract: orange belongs to actions, and
 * red means a loss. Not buying for a while is neither — a lapse is drawn in the
 * paler purple rather than in a warning colour.
 */
export function PbCadenceChart({ cadence }: { readonly cadence: Cadence }) {
  const { bars, medianGapDays, longestGapDays, daysSinceLast, isLapsedNow } =
    cadence;

  // The first bar has no gap to show, so the drawn series is everything after it.
  const drawn = bars.filter((bar) => bar.gapDays !== null);

  return (
    <PbCard className="p-[18px]">
      <PbCardHeader
        className="mb-3.5 items-baseline p-0"
        title="Investing frequency"
        note={
          medianGapDays === null
            ? `${cadence.buys} buy${cadence.buys === 1 ? "" : "s"}`
            : `${cadence.buys} buys · ${describeCadence(medianGapDays)}`
        }
      >
        <div className="flex items-center gap-3 font-number text-[9.5px] text-pb-faint">
          <span className="flex items-center gap-1.5">
            <span className="block h-[9px] w-2 rounded-[2px] bg-pb-purple" />
            on rhythm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="block h-[9px] w-2 rounded-[2px] bg-pb-purple-pale" />
            lapse
          </span>
        </div>
      </PbCardHeader>

      {drawn.length === 0 ? (
        <p className="py-6 text-center text-[11.5px] text-pb-faint">
          A second buy is needed before there is a rhythm to measure.
        </p>
      ) : (
        <Bars cadence={cadence} />
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-pb-hairline pt-3 sm:grid-cols-3">
        <Stat
          label="Usual gap"
          value={medianGapDays === null ? "—" : `${Math.round(medianGapDays)}d`}
          caption={describeCadence(medianGapDays)}
        />
        <Stat
          label="Longest gap"
          value={longestGapDays === null ? "—" : `${longestGapDays}d`}
          caption={
            cadence.longestGapDate === null
              ? "no gap yet"
              : `ended ${cadence.longestGapDate}`
          }
        />
        <Stat
          label="Since last buy"
          value={daysSinceLast === null ? "—" : `${daysSinceLast}d`}
          caption={isLapsedNow ? "past your usual rhythm" : "on rhythm"}
          valueClassName={isLapsedNow ? "text-pb-purple-pale" : undefined}
        />
      </div>
    </PbCard>
  );
}

function Bars({ cadence }: { readonly cadence: Cadence }) {
  const drawn = cadence.bars.filter((bar) => bar.gapDays !== null);
  const max = Math.max(...drawn.map((bar) => bar.gapDays!), 1);

  // A gap of one bar-width keeps the marks readable however many there are; the
  // viewBox stretches to the card, so this is proportion rather than pixels.
  const slot = VIEW_WIDTH / drawn.length;
  const barWidth = Math.max(slot * 0.55, 1.5);
  const medianY =
    cadence.medianGapDays === null
      ? null
      : VIEW_HEIGHT - (cadence.medianGapDays / max) * VIEW_HEIGHT;

  return (
    <>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-[110px] w-full"
        role="img"
        aria-label={`Gap between buys, ${drawn.length} bars, usually about ${
          cadence.medianGapDays ?? 0
        } days`}
      >
        {medianY !== null && (
          <line
            x1="0"
            y1={medianY}
            x2={VIEW_WIDTH}
            y2={medianY}
            stroke="#3A3350"
            strokeWidth={1.4}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {drawn.map((bar, index) => {
          const height = Math.max((bar.gapDays! / max) * VIEW_HEIGHT, 2);
          return (
            <rect
              key={bar.date + index}
              x={index * slot + (slot - barWidth) / 2}
              y={VIEW_HEIGHT - height}
              width={barWidth}
              height={height}
              rx={1}
              fill={bar.isLapse ? "#C084FC" : "#8B5CF6"}
              opacity={bar.isLapse ? 1 : 0.85}
            >
              <title>
                {`${bar.date} — ${bar.gapDays} days after the previous buy${
                  bar.isLapse ? " (a lapse)" : ""
                }`}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center justify-between gap-2 font-number text-[10px] text-pb-faintest">
        <span>{edgeLabel(drawn[0].date, "ALL")}</span>
        <span className="truncate">days between buys · usual ┄</span>
        <span>{edgeLabel(drawn[drawn.length - 1].date, "ALL")}</span>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  caption,
  valueClassName,
}: {
  readonly label: string;
  readonly value: string;
  readonly caption: string;
  readonly valueClassName?: string;
}) {
  return (
    <div>
      <span className="block font-number text-[9.5px] tracking-[0.11em] text-pb-muted uppercase">
        {label}
      </span>
      <span
        className={`mt-0.5 block font-number text-[15px] font-medium tabular-nums ${
          valueClassName ?? ""
        }`}
      >
        {value}
      </span>
      <span className="block text-[10.5px] text-pb-faint">{caption}</span>
    </div>
  );
}
