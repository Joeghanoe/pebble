import { z } from "zod";

// Stooq uses different suffix conventions than Yahoo Finance.
// This maps the most common Yahoo suffixes to stooq equivalents.
const SUFFIX_MAP: Record<string, string> = {
  ".L":   ".UK",  // London Stock Exchange
  ".AS":  ".NL",  // Amsterdam (Euronext NL)
  ".PA":  ".FR",  // Paris (Euronext FR)
  ".DE":  ".DE",  // Xetra — same
  ".MI":  ".IT",  // Milan
  ".MC":  ".ES",  // Madrid
  ".BR":  ".BE",  // Brussels
  ".ZU":  ".CH",  // Zurich
  ".VI":  ".AT",  // Vienna
  ".LS":  ".PT",  // Lisbon
};

/**
 * Convert a Yahoo Finance ticker to stooq format.
 * e.g. "VUAA.L" → "VUAA.UK", "SPY" → "SPY.US"
 */
export function toStooqTicker(yahooTicker: string): string {
  for (const [from, to] of Object.entries(SUFFIX_MAP)) {
    if (yahooTicker.toUpperCase().endsWith(from.toUpperCase())) {
      return yahooTicker.slice(0, -from.length) + to;
    }
  }
  // No recognised suffix → assume US equity (stooq uses .US for NYSE/NASDAQ)
  if (!yahooTicker.includes(".")) return yahooTicker + ".US";
  // Already has an unknown suffix — pass through and let stooq decide
  return yahooTicker;
}

const StooqRowSchema = z.object({
  Symbol: z.string(),
  Date:   z.string(),   // YYYY-MM-DD
  Close:  z.string(),   // numeric string or "N/D"
});

function parseCsv(text: string): Array<Record<string, string>> {
  const [headerLine, ...dataLines] = text.trim().split("\n");
  if (!headerLine) return [];
  const headers = headerLine.split(",").map(h => h.trim());
  return dataLines
    .filter(line => line.trim())
    .map(line => {
      const vals = line.split(",").map(v => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
}

export class StooqClient {
  /** Fetch the latest available closing price for a ticker. */
  async getLivePrice(yahooTicker: string): Promise<number | null> {
    const ticker = toStooqTicker(yahooTicker);
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return null;
      const text = await res.text();
      const rows = parseCsv(text);
      const row = StooqRowSchema.safeParse(rows[0]);
      if (!row.success) return null;
      const close = parseFloat(row.data.Close);
      if (isNaN(close) || row.data.Close === "N/D") return null;
      return close;
    } catch {
      return null;
    }
  }

  /** Fetch the closing price on or just before a given date (YYYY-MM-DD). */
  async getHistoricalPrice(yahooTicker: string, date: string): Promise<number | null> {
    const ticker = toStooqTicker(yahooTicker);
    // Fetch a small window around the target date (go back up to 7 days to handle weekends)
    const target = new Date(date);
    const from = new Date(target);
    from.setDate(from.getDate() - 7);

    const d1 = from.toISOString().slice(0, 10).replace(/-/g, "");
    const d2 = target.toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}&d1=${d1}&d2=${d2}&i=d`;

    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return null;
      const text = await res.text();
      const rows = parseCsv(text);
      if (rows.length === 0) return null;

      // Take the last row (most recent date ≤ target)
      const lastRow = rows[rows.length - 1];
      const row = StooqRowSchema.safeParse(lastRow);
      if (!row.success) return null;
      const close = parseFloat(row.data.Close);
      if (isNaN(close) || row.data.Close === "N/D") return null;
      return close;
    } catch {
      return null;
    }
  }
}
