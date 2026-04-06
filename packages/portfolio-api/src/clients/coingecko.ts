import { z } from "zod";

const CoinGeckoHistorySchema = z.object({
  id: z.string(),
  market_data: z
    .object({
      current_price: z.record(z.string(), z.number()),
    })
    .optional(),
});

const CoinGeckoSimplePriceSchema = z.record(
  z.string(),
  z.object({ eur: z.number() })
);

export class CoinGeckoClient {
  private readonly baseUrl = "https://api.coingecko.com/api/v3";

  constructor(private readonly apiKey: string) {}

  /**
   * Get the current live price for a coin in EUR using /simple/price.
   * @param coinId CoinGecko coin ID, e.g. "bitcoin"
   */
  async getLivePrice(coinId: string): Promise<number | null> {
    try {
      const url = `${this.baseUrl}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=eur`;
      const response = await fetch(url, {
        headers: {
          "x-cg-demo-api-key": this.apiKey,
          "User-Agent": "Mozilla/5.0",
        },
      });
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      const parsed = CoinGeckoSimplePriceSchema.parse(raw);
      return parsed[coinId]?.eur ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get historical price for a coin in EUR.
   * @param coinId CoinGecko coin ID, e.g. "bitcoin"
   * @param date ISO date string YYYY-MM-DD
   */
  async getHistoricalPrice(coinId: string, date: string): Promise<number | null> {
    try {
      // CoinGecko expects DD-MM-YYYY
      const [year, month, day] = date.split("-");
      const cgDate = `${day}-${month}-${year}`;

      const url = `${this.baseUrl}/coins/${encodeURIComponent(coinId)}/history?date=${cgDate}&localization=false`;
      const response = await fetch(url, {
        headers: {
          "x-cg-demo-api-key": this.apiKey,
          "User-Agent": "Mozilla/5.0",
        },
      });
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      const parsed = CoinGeckoHistorySchema.parse(raw);
      return parsed.market_data?.current_price["eur"] ?? null;
    } catch {
      return null;
    }
  }
}
