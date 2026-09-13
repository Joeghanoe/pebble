// src/frontend/components/pebble/Heatmap.tsx
import { heatCell, type HeatRow } from "@/lib/series";
import { formatPct } from "@/lib/format";
import { PbCard, PbCardHeader } from "./primitives";

const MONTH_INITIALS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];
const MONTH_NAMES = [
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

/** The legend's five stops, matching the ramp `heatCell` walks. */
const SCALE = [
  "oklch(0.42 0.15 22)",
  "oklch(0.32 0.09 22)",
  "#191524",
  "oklch(0.42 0.13 295)",
  "oklch(0.62 0.2 295)",
];

/**
 * A year per row, a month per cell. The point is the shape of a run of months,
 * not any single figure, so the cells carry a rounded integer and the precise
 * value lives in the tooltip.
 */
export function PbHeatmap({ rows }: { readonly rows: readonly HeatRow[] }) {
  return (
    <PbCard className="p-[18px]">
      <PbCardHeader
        className="mb-3.5 items-baseline p-0"
        title="Monthly P&L"
        note="realised + unrealised, % of portfolio"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-number text-[9.5px] text-pb-faint">−15%</span>
          {SCALE.map((background) => (
            <span
              key={background}
              className="block h-[9px] w-3 rounded-[2px]"
              style={{ background }}
            />
          ))}
          <span className="font-number text-[9.5px] text-pb-faint">+15%</span>
        </div>
      </PbCardHeader>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[11.5px] text-pb-faint">
          A month of history has to pass before there is anything to compare.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[560px] gap-[5px]"
            style={{ gridTemplateColumns: "42px repeat(12, minmax(0,1fr))" }}
          >
            <span />
            {MONTH_INITIALS.map((initial, index) => (
              <span
                key={index}
                className="text-center font-number text-[9.5px] text-pb-faint"
              >
                {initial}
              </span>
            ))}

            {rows.map((row) => (
              <Row key={row.year} row={row} />
            ))}
          </div>
        </div>
      )}
    </PbCard>
  );
}

function Row({ row }: { readonly row: HeatRow }) {
  return (
    <>
      <span className="self-center font-number text-[10.5px] text-pb-muted">
        {row.year}
      </span>
      {row.months.map((value, index) => {
        const cell = heatCell(value);
        return (
          <span
            key={index}
            title={
              value === null
                ? `${MONTH_NAMES[index]} ${row.year}: no data`
                : `${MONTH_NAMES[index]} ${row.year}: ${formatPct(value)}`
            }
            className="flex h-[30px] cursor-default items-center justify-center rounded-[5px] font-number text-[9.5px] transition-[filter] hover:brightness-135"
            style={{
              background: cell.background,
              border: cell.border,
              color: cell.color,
            }}
          >
            {cell.label}
          </span>
        );
      })}
    </>
  );
}
