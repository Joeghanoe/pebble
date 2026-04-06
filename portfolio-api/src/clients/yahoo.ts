import { z } from "zod";

const YahooQuoteSchema = z.object({
  chart: z.object({
    result: z.array(
      z.object({
        meta: z.object({
          regularMarketPrice: z.number(),
          currency: z.string().optional(),
        }),
      })
    ).nullable(),
    error: z.unknown().nullable(),
  }),
});

const YahooHistoricalSchema = z.object({
  chart: z.object({
    result: z.array(
      z.object({
        timestamp: z.array(z.number()),
        indicators: z.object({
          adjclose: z.array(
            z.object({
              adjclose: z.array(z.number().nullable()),
            })
          ),
        }),
      })
    ).nullable(),
    error: z.unknown().nullable(),
  }),
});

export class YahooClient {
  private readonly baseUrl = "https://query1.finance.yahoo.com/v8/finance/chart";

  async getLivePrice(ticker: string): Promise<number | null> {
    try {
      const url = `${this.baseUrl}/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      const parsed = YahooQuoteSchema.parse(raw);
      const result = parsed.chart.result?.[0];
      if (!result) return null;
      return result.meta.regularMarketPrice;
    } catch {
      return null;
    }
  }

  async getHistoricalPrice(ticker: string, date: string): Promise<number | null> {
    try {
      // Convert YYYY-MM-DD to Unix timestamps
      const targetDate = new Date(date);
      const start = Math.floor(targetDate.getTime() / 1000) - 86400;
      const end = Math.floor(targetDate.getTime() / 1000) + 86400 * 3; // 3 days forward to handle weekends

      const url = `${this.baseUrl}/${encodeURIComponent(ticker)}?interval=1d&period1=${start}&period2=${end}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      const parsed = YahooHistoricalSchema.parse(raw);
      const result = parsed.chart.result?.[0];
      if (!result) return null;

      const closes = result.indicators.adjclose[0]?.adjclose ?? [];
      // Return the last non-null close price (most recent available)
      for (let i = closes.length - 1; i >= 0; i--) {
        const price = closes[i];
        if (price !== null && price !== undefined) return price;
      }
      return null;
    } catch {
      return null;
    }
  }
}
