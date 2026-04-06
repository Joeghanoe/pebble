import { z } from "zod";

const FrankfurterResponseSchema = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

export class FrankfurterClient {
  private readonly baseUrl = "https://api.frankfurter.app";

  /** Returns the EUR/USD rate for a given date (USD per 1 EUR) */
  async getRate(date: string): Promise<number> {
    const url = `${this.baseUrl}/${date}?from=EUR&to=USD`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`);
    }
    const raw: unknown = await response.json();
    const parsed = FrankfurterResponseSchema.parse(raw);
    const usd = parsed.rates["USD"];
    if (usd === undefined) {
      throw new Error(`No USD rate found in Frankfurter response for ${date}`);
    }
    return usd;
  }
}
