// src/frontend/components/pebble/ProjectionChart.tsx
import * as React from "react";

export interface ProjectionSeries {
  readonly label: string;
  readonly color: string;
  /** One value per month, index 0 being today. Every series is the same length. */
  readonly values: readonly number[];
  readonly dashed?: boolean;
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD = 8;

/**
 * Where the portfolio could be, month by month, under each scenario.
 *
 * The band between the lowest and highest scenario is the point: one line
 * would read as a forecast, and a range reads as what it is — a set of
 * assumptions. The target is a horizontal rule, and its date a vertical one,
 * so where each line crosses the corner they make is the whole answer.
 *
 * Hand-built like the other Pebble charts: a few paths, labels in the DOM
 * rather than the SVG so the stretched viewBox cannot distort them.
 */
export function PbProjectionChart({
  series,
  dates,
  target,
  targetIndex,
  targetLabel,
  formatValue,
  height = 220,
}: {
  readonly series: readonly ProjectionSeries[];
  /** One ISO date per month, the same length as each series. */
  readonly dates: readonly string[];
  readonly target: number;
  /** The month the target falls due. */
  readonly targetIndex: number;
  readonly targetLabel: string;
  readonly formatValue: (value: number) => string;
  readonly height?: number;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const length = dates.length;
  if (length < 2 || series.length === 0) {
    return null;
  }

  const top =
    Math.max(target, ...series.flatMap((s) => s.values as number[])) * 1.08;
  const x = (i: number) => (i / (length - 1)) * WIDTH;
  const y = (v: number) =>
    HEIGHT - PAD - (Math.max(0, v) / top) * (HEIGHT - 2 * PAD);

  const line = (values: readonly number[]) =>
    values
      .map(
        (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`,
      )
      .join(" ");

  const low = dates.map((_, i) => Math.min(...series.map((s) => s.values[i])));
  const high = dates.map((_, i) => Math.max(...series.map((s) => s.values[i])));
  const band =
    line(high) +
    " " +
    low
      .map((v, i) => [i, v] as const)
      .reverse()
      .map(([i, v]) => `L${x(i).toFixed(2)},${y(v).toFixed(2)}`)
      .join(" ") +
    " Z";

  const targetX = x(targetIndex) / WIDTH;
  const targetY = y(target) / HEIGHT;

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) {
      return;
    }
    const fraction = (event.clientX - box.left) / box.width;
    setActive(
      Math.min(length - 1, Math.max(0, Math.round(fraction * (length - 1)))),
    );
  }

  return (
    <>
      <div
        className="relative mt-2"
        style={{ height }}
        onPointerMove={handleMove}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-full w-full"
        >
          <path d={band} fill="#8B5CF6" fillOpacity={0.1} />
          <line
            x1={0}
            x2={WIDTH}
            y1={y(target)}
            y2={y(target)}
            stroke="#F1EEF8"
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={x(targetIndex)}
            x2={x(targetIndex)}
            y1={0}
            y2={HEIGHT}
            stroke="#F1EEF8"
            strokeOpacity={0.25}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {series.map((s) => (
            <path
              key={s.label}
              d={line(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 1.6 : 2.2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Labels and marks live in the DOM so the stretched viewBox leaves them round. */}
        <div className="pointer-events-none absolute inset-0">
          <span
            className="absolute left-0 -translate-y-full pb-0.5 font-number text-[9.5px] text-pb-text-3"
            style={{ top: `${targetY * 100}%` }}
          >
            target {formatValue(target)}
          </span>
          <span
            className="absolute top-0 font-number text-[9.5px] whitespace-nowrap text-pb-text-3"
            style={{
              left: `${targetX * 100}%`,
              transform:
                targetX > 0.7
                  ? "translateX(calc(-100% - 6px))"
                  : "translateX(6px)",
            }}
          >
            {targetLabel}
          </span>
          <span
            className="absolute block size-[7px] rounded-full bg-pb-text"
            style={{
              left: `${targetX * 100}%`,
              top: `${targetY * 100}%`,
              marginLeft: -3.5,
              marginTop: -3.5,
              boxShadow: "0 0 0 1.5px #08070C",
            }}
          />
          {active !== null && (
            <>
              <span
                className="absolute top-0 bottom-0 w-px bg-pb-strong"
                style={{ left: `${(x(active) / WIDTH) * 100}%` }}
              />
              <Readout
                fraction={active / (length - 1)}
                date={dates[active]}
                rows={series.map((s) => ({
                  label: s.label,
                  color: s.color,
                  value: formatValue(s.values[active]),
                }))}
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 font-number text-[10px] text-pb-faintest">
        <span>{dates[0]}</span>
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span
                className="block h-[2px] w-3 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </span>
        <span>{dates[length - 1]}</span>
      </div>
    </>
  );
}

function Readout({
  fraction,
  date,
  rows,
}: {
  readonly fraction: number;
  readonly date: string;
  readonly rows: readonly { label: string; value: string; color: string }[];
}) {
  const flip = fraction > 0.5;
  return (
    <div
      className="absolute top-4 z-[2] min-w-[140px] rounded-[9px] border border-pb-strong bg-pb-modal px-2.5 py-2"
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
    </div>
  );
}
