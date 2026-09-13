// src/frontend/components/pebble/Donut.tsx

export interface DonutSegment {
  readonly label: string;
  readonly color: string;
  /** 0–1. */
  readonly fraction: number;
}

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * An allocation ring drawn as dashed circles rather than arc paths: one circle
 * per class, its dash equal to its share of the circumference, offset by the
 * shares before it. Two user units come off each dash so neighbouring segments
 * separate by a hairline instead of butting into one colour smear.
 */
export function PbDonut({
  segments,
  centerValue,
  centerLabel,
  size = 116,
}: {
  readonly segments: readonly DonutSegment[];
  readonly centerValue: React.ReactNode;
  readonly centerLabel: string;
  readonly size?: number;
}) {
  // Each segment starts where the ones before it end, so its offset is the sum
  // of the fractions ahead of it. Derived per segment rather than carried in a
  // counter mutated during render.
  const arcs = segments.map((segment, index) => ({
    segment,
    offset:
      -CIRCUMFERENCE *
      segments.slice(0, index).reduce((sum, prior) => sum + prior.fraction, 0),
  }));

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        className="-rotate-90"
        style={{ width: size, height: size }}
      >
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="#191524"
          strokeWidth="14"
        />
        {arcs.map(({ segment, offset }) => {
          if (segment.fraction <= 0) {
            return null;
          }
          const dash = Math.max(0, CIRCUMFERENCE * segment.fraction - 2);
          return (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth="14"
              strokeLinecap="butt"
              strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-number text-base font-medium tabular-nums">
          {centerValue}
        </span>
        <span className="font-number text-[9.5px] tracking-[0.08em] text-pb-muted uppercase">
          {centerLabel}
        </span>
      </div>
    </div>
  );
}
