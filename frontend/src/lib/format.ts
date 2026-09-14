// src/lib/format.ts
//
// One place for every number the UI shows. The conventions are European and they
// are not negotiable per-screen: thousands separator `.`, decimal separator `,`,
// and the true minus glyph `−` (U+2212) rather than a hyphen, which sits too high
// and too short beside tabular digits.

/** U+2212. A hyphen-minus is never used for a negative number. */
const MINUS = "−";

function grouped(value: number, min: number, max: number): string {
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(Math.abs(value));
}

function signed(value: number, body: string): string {
  if (value < 0) {
    return MINUS + body;
  }
  return body;
}

/** `€38.208,38`. The default for every monetary figure. */
export function formatEur(amount: number): string {
  return signed(amount, "€" + grouped(amount, 2, 2));
}

/**
 * A unit price. Sub-cent assets print seven decimals — `€0,0000975` — because two
 * would round a whole shitcoin position to zero.
 */
export function formatEurPrice(amount: number): string {
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return signed(amount, "€" + grouped(amount, 7, 7));
  }
  return formatEur(amount);
}

export function formatUsdPrice(amount: number): string {
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 7,
      maximumFractionDigits: 7,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * A signed percentage. `decimals` defaults to two; the sidebar passes one.
 * Zero is neither up nor down, so it prints unsigned.
 */
export function formatPct(pct: number, decimals = 2): string {
  const body = grouped(pct, decimals, decimals) + "%";
  if (pct > 0) {
    return "+" + body;
  }
  if (pct < 0) {
    return MINUS + body;
  }
  return body;
}

/**
 * An asset quantity. Eight decimals is the crypto convention and the point of
 * `fullPrecision`; a holding of a thousand or more units is a share count or a
 * cash balance, where eight decimals is noise, so it groups as an integer.
 */
export function formatUnits(units: number, fullPrecision = true): string {
  if (Math.abs(units) >= 1000) {
    return signed(units, grouped(units, 0, 0));
  }
  return signed(units, grouped(units, 0, fullPrecision ? 8 : 2));
}

/** `0,50122376 BTC` — eight decimals, always, however small. */
export function formatBtc(btc: number): string {
  return signed(btc, grouped(btc, 8, 8));
}

/** Sats are BTC × 100 000 000, grouped, never fractional. */
export function formatSats(btc: number): string {
  return signed(btc, grouped(Math.round(btc * 1e8), 0, 0));
}

/** Human-readable relative age: `1m ago`, `5m ago`, `1h ago`, ... */
export function formatSyncStamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  const diffMs = Date.now() - parsed.getTime();
  if (diffMs <= 0) {
    return "now";
  }

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.round(diffMs / minuteMs))}m ago`;
  }
  if (diffMs < dayMs) {
    return `${Math.max(1, Math.round(diffMs / hourMs))}h ago`;
  }
  if (diffMs < 7 * dayMs) {
    return `${Math.max(1, Math.round(diffMs / dayMs))}d ago`;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}`;
  // A date-only snapshot ('YYYY-MM-DD') parses to midnight UTC; printing "00:00"
  // for it would read as a real timestamp, so the day stands alone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return day;
  }
  return `${day} · ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
