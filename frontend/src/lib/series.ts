// src/lib/series.ts
//
// The two line charts are hand-built SVG rather than Recharts. They carry no axes,
// no gridlines and no tooltip — a shape, a gradient and two end labels — and
// reaching for a chart library to draw one path costs more in wrapper markup than
// the fifteen lines below.

export type Timeframe = "1W" | "1M" | "1Y" | "ALL";

export const TIMEFRAMES: Timeframe[] = ["1W", "1M", "1Y", "ALL"];

/** The API's snapshot granularities. */
export type SnapshotPeriod = "1d" | "1w" | "1m";

/**
 * A timeframe is a *range*; the API's `period` is a *granularity*. The mapping
 * picks the coarsest granularity that still gives the range enough points, and
 * `points` then trims the tail.
 *
 * `1D` is missing on purpose. Pebble stores one snapshot a day, so a one-day
 * window is a single point — there is no intraday series to draw.
 */
const RANGES: Record<Timeframe, { period: SnapshotPeriod; points: number }> = {
  "1W": { period: "1d", points: 7 },
  "1M": { period: "1d", points: 31 },
  "1Y": { period: "1w", points: 53 },
  ALL: { period: "1m", points: Number.POSITIVE_INFINITY },
};

export function timeframePeriod(tf: Timeframe): SnapshotPeriod {
  return RANGES[tf].period;
}

/** The tail of a series that the timeframe actually covers. */
export function sliceTimeframe<T>(points: readonly T[], tf: Timeframe): T[] {
  const { points: count } = RANGES[tf];
  if (!Number.isFinite(count) || points.length <= count) {
    return [...points];
  }
  return points.slice(points.length - count);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The two labels under a chart. They are the only axis it has, so they read as
 * dates rather than as ticks: a day and month inside a year, a month and year
 * once the range spans one.
 */
export function edgeLabel(iso: string, tf: Timeframe): string {
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1] ?? month;
  if (tf === "1Y" || tf === "ALL") {
    return `${name} ${year}`;
  }
  return `${day} ${name}`;
}

export interface CurvePaths {
  line: string;
  area: string;
}

/**
 * A smooth cubic through `values`, scaled to fill `width` × `height`.
 *
 * Control points sit on the vertical midline between each pair, which is the
 * cheapest curve that never overshoots the data — a Catmull-Rom would bow past a
 * local minimum and invent a dip the portfolio never had.
 *
 * `domain` lets several series share one vertical scale. Without it a benchmark
 * drawn against its own min/max would track the portfolio line exactly.
 */
export function curve(
  values: readonly number[],
  width: number,
  height: number,
  pad = 6,
  domain?: readonly [number, number],
): CurvePaths | null {
  if (values.length < 2) {
    return null;
  }
  const [min, max] = domain ?? [Math.min(...values), Math.max(...values)];
  const range = max - min || 1;
  const points = values.map((value, index): [number, number] => [
    (index / (values.length - 1)) * width,
    pad + (1 - (value - min) / range) * (height - pad * 2),
  ]);

  let line = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    const mid = ((previous[0] + point[0]) / 2).toFixed(1);
    line += ` C${mid},${previous[1].toFixed(1)} ${mid},${point[1].toFixed(1)} ${point[0].toFixed(1)},${point[1].toFixed(1)}`;
  }
  return { line, area: `${line} L${width},${height} L0,${height} Z` };
}

/** The shared vertical scale across however many series a chart draws. */
export function sharedDomain(
  ...series: readonly (readonly number[])[]
): [number, number] | undefined {
  const all = series.flat();
  if (all.length === 0) {
    return undefined;
  }
  return [Math.min(...all), Math.max(...all)];
}

export interface HeatCell {
  /** null when the month has no snapshot to compare against. */
  value: number | null;
  background: string;
  border: string;
  color: string;
  label: string;
}

/**
 * The heatmap's colour ramp. Purple for a gain, red for a loss, saturating at
 * ±15% — beyond that the eye cannot rank shades anyway, and a single outlier
 * month would otherwise flatten every other cell to grey.
 */
export function heatCell(value: number | null): HeatCell {
  if (value === null) {
    return {
      value,
      background: "#0E0C14",
      border: "1px solid #16131F",
      color: "#2E2940",
      label: "",
    };
  }
  const t = Math.min(Math.abs(value) / 15, 1);
  if (Math.abs(value) < 0.35) {
    return {
      value,
      background: "#191524",
      border: "1px solid #221E30",
      color: "#6F6885",
      label: "0",
    };
  }
  const hue = value > 0 ? 295 : 22;
  const lightness = 0.3 + 0.32 * t;
  const chroma = (value > 0 ? 0.09 : 0.07) + 0.11 * t;
  return {
    value,
    background: `oklch(${lightness.toFixed(2)} ${chroma.toFixed(2)} ${hue})`,
    border: `1px solid oklch(${(lightness + 0.08).toFixed(2)} ${chroma.toFixed(2)} ${hue} / 0.5)`,
    color: t > 0.45 ? "#F4F1FA" : "#B6AFCB",
    label: (value > 0 ? "+" : "−") + Math.abs(value).toFixed(0),
  };
}

export interface HeatRow {
  year: number;
  /** Twelve entries, January first. */
  months: (number | null)[];
}

/**
 * Monthly P&L as a percentage of the portfolio, from month-end net-worth
 * snapshots.
 *
 * The month's gain is the change in total worth less the money added over the
 * same month — otherwise a €2.000 deposit reads as a 5% winning month. It is
 * expressed against the opening total, so it is a return and not an amount.
 *
 * The first month in the series has nothing to open against, and any month with
 * no snapshot is a gap; both come back as null and render as an empty cell.
 */
export function monthlyPnl(
  snapshots: readonly {
    date: string;
    total_eur: number;
    invested_eur: number;
  }[],
): HeatRow[] {
  if (snapshots.length === 0) {
    return [];
  }
  const byMonth = new Map<string, { total: number; invested: number }>();
  for (const snapshot of snapshots) {
    byMonth.set(snapshot.date.slice(0, 7), {
      total: snapshot.total_eur,
      invested: snapshot.invested_eur,
    });
  }

  const first = snapshots[0].date;
  const last = snapshots[snapshots.length - 1].date;
  const firstYear = Number(first.slice(0, 4));
  const lastYear = Number(last.slice(0, 4));

  const rows: HeatRow[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const months: (number | null)[] = [];
    for (let month = 0; month < 12; month++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const previousDate = new Date(Date.UTC(year, month - 1, 1));
      const previousKey = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
      const now = byMonth.get(key);
      const before = byMonth.get(previousKey);
      if (!now || !before || before.total <= 0) {
        months.push(null);
        continue;
      }
      const gain = now.total - before.total - (now.invested - before.invested);
      months.push((gain / before.total) * 100);
    }
    rows.push({ year, months });
  }
  return rows;
}
