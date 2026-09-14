// src/frontend/components/pebble/CadenceChart.tsx
import { describeCadence, type Cadence } from "@/lib/cadence";
import { edgeLabel } from "@/lib/series";
import { PbCard, PbCardHeader } from "./primitives";

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 130;
const PAD = 10;

/**
 * When each buy happened: buy number across, date up.
 *
 * The shape is the point, and the rule is the one written on the spreadsheet
 * this replaces — the more linear the better. Buying on a steady rhythm plots a
 * straight line, so the dashed reference is exactly that: the straight run from
 * the first buy to the last. Where the real line sags below it you were buying
 * faster than your average; where it climbs above, a gap opened.
 *
 * Segments are straight rather than smoothed. A curve through these points
 * would round off the corner where a gap starts, which is the one feature worth
 * seeing.
 *
 * Purple throughout, per the accent contract: orange belongs to actions and red
 * means a loss. A month not bought is neither, so a lapse is marked with the
 * paler purple rather than a warning colour.
 */
export function PbCadenceChart({ cadence }: { readonly cadence: Cadence }) {
  const { bars, medianGapDays, longestGapDays, daysSinceLast, isLapsedNow } =
    cadence;

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
        <span className="font-number text-[9.5px] text-pb-faint">
          the more linear the better
        </span>
      </PbCardHeader>

      {bars.length < 2 ? (
        <p className="py-6 text-center text-[11.5px] text-pb-faint">
          A second buy is needed before there is a rhythm to measure.
        </p>
      ) : (
        <Line cadence={cadence} />
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

function Line({ cadence }: { readonly cadence: Cadence }) {
  const { bars } = cadence;

  // Buy number across, so the marks are evenly spaced however irregular the
  // dates are; date up, so the slope between two marks is the gap between them.
  const times = bars.map((bar) => Date.parse(`${bar.date}T00:00:00Z`));
  const first = times[0];
  const last = times[times.length - 1];
  const span = last - first || 1;

  const x = (index: number) => (index / (bars.length - 1)) * VIEW_WIDTH;
  const y = (time: number) =>
    PAD + (1 - (time - first) / span) * (VIEW_HEIGHT - PAD * 2);

  const points = bars.map((bar, index) => ({
    bar,
    x: x(index),
    y: y(times[index]),
  }));
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");

  return (
    <>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-[118px] w-full"
        role="img"
        aria-label={`When each of ${bars.length} buys happened. A straight line means a steady rhythm; ${
          cadence.longestGapDays ?? 0
        } days was the longest gap.`}
      >
        {/* Perfectly even pacing: the straight run between the first buy and
            the last. The real line is read against this, not against zero. */}
        <line
          x1={x(0)}
          y1={y(first)}
          x2={x(bars.length - 1)}
          y2={y(last)}
          stroke="#3A3350"
          strokeWidth={1.4}
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={path}
          fill="none"
          stroke="#8B5CF6"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map(({ bar, x: cx, y: cy }, index) => (
          <circle
            key={bar.date + index}
            cx={cx}
            cy={cy}
            r={bar.isLapse ? 4 : 3}
            fill={bar.isLapse ? "#C084FC" : "#8B5CF6"}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {bar.gapDays === null
                ? `${bar.date} — first buy`
                : `${bar.date} — ${bar.gapDays} days after the previous buy${
                    bar.isLapse ? " (a lapse)" : ""
                  }`}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1.5 flex items-center justify-between gap-2 font-number text-[10px] text-pb-faintest">
        <span>{edgeLabel(bars[0].date, "ALL")}</span>
        <span className="truncate">buy 1 → {bars.length} · even pace ┄</span>
        <span>{edgeLabel(bars[bars.length - 1].date, "ALL")}</span>
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
