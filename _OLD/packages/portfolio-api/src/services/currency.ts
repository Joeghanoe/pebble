import type { FrankfurterClient } from "../clients/frankfurter";

export class CurrencyService {
  private readonly cache = new Map<string, number>();

  constructor(private readonly client: FrankfurterClient) {}

  async getEurUsdRate(date: string): Promise<number> {
    const cached = this.cache.get(date);
    if (cached !== undefined) return cached;

    const rate = await this.client.getRate(date);
    this.cache.set(date, rate);
    return rate;
  }
}
