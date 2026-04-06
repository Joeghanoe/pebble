import type { CoinGeckoClient } from "../clients/coingecko";
import type { StooqClient } from "../clients/stooq";
import type { YahooClient } from "../clients/yahoo";
import type { CurrencyService } from "./currency";
import type { Asset } from "../types/db";
import type { PriceResult } from "../types/price";
import { upsertPrice, getLatestPrice } from "../db/queries/prices";

export class PriceService {
  constructor(
    private readonly coingecko: CoinGeckoClient,
    private readonly stooq: StooqClient,
    private readonly yahoo: YahooClient,
    private readonly currency: CurrencyService
  ) {}

  async fetchLivePrice(asset: Asset): Promise<PriceResult> {
    const today = new Date().toISOString().slice(0, 10);

    if (asset.type === "crypto") return this.fetchLiveCryptoPrice(asset, today);
    if (asset.type === "etf")    return this.fetchLiveEtfPrice(asset, today);

    // cash — no price fetch
    return { status: "unavailable" };
  }

  private async fetchLiveCryptoPrice(asset: Asset, today: string): Promise<PriceResult> {
    const rate = await this.getEurUsdRateSafe(today);

    if (asset.coingecko_id) {
      const cgPrice = await this.coingecko.getLivePrice(asset.coingecko_id);
      if (cgPrice !== null) {
        upsertPrice(asset.id, today, cgPrice, rate);
        return { status: "ok", priceEur: cgPrice, date: today, exchangeRate: rate };
      }
    }

    return this.getStaleOrUnavailable(asset.id);
  }

  private async fetchLiveEtfPrice(asset: Asset, today: string): Promise<PriceResult> {
    if (!asset.yahoo_ticker) return this.getStaleOrUnavailable(asset.id);

    const price = await this.stooq.getLivePrice(asset.yahoo_ticker);
    if (price !== null) {
      const rate = await this.getEurUsdRateSafe(today);
      // Stooq returns the price in the listing's local currency.
      // European EUR-listed ETFs (.DE, .AS, .PA) are already in EUR — no conversion.
      // All others (e.g. .L on LSE which is USD-denominated) divide by EUR/USD rate.
      const priceEur = isEurListing(asset.yahoo_ticker) ? price : price / rate;
      upsertPrice(asset.id, today, priceEur, rate);
      return { status: "ok", priceEur, date: today, exchangeRate: rate };
    }

    return this.getStaleOrUnavailable(asset.id);
  }

  async fetchHistoricalPrice(asset: Asset, date: string): Promise<PriceResult> {
    const rate = await this.getEurUsdRateSafe(date);

    if (asset.type === "crypto") {
      if (!asset.coingecko_id) return this.getStaleOrUnavailable(asset.id);
      const price = await this.coingecko.getHistoricalPrice(asset.coingecko_id, date);
      if (price !== null) {
        upsertPrice(asset.id, date, price, rate);
        return { status: "ok", priceEur: price, date, exchangeRate: rate };
      }
      return this.getStaleOrUnavailable(asset.id);
    }

    if (asset.type === "etf") {
      if (!asset.yahoo_ticker) return { status: "unavailable" };
      // Stooq blocks historical requests — use Yahoo Finance for historical ETF prices
      const price = await this.yahoo.getHistoricalPrice(asset.yahoo_ticker, date);
      if (price !== null) {
        const priceEur = isEurListing(asset.yahoo_ticker) ? price : price / rate;
        upsertPrice(asset.id, date, priceEur, rate);
        return { status: "ok", priceEur, date, exchangeRate: rate };
      }
      return this.getStaleOrUnavailable(asset.id);
    }

    return { status: "unavailable" };
  }

  private getStaleOrUnavailable(assetId: number): PriceResult {
    const latest = getLatestPrice(assetId);
    if (latest) {
      return {
        status: "stale",
        priceEur: latest.price_eur,
        lastKnownDate: latest.date,
        exchangeRate: latest.exchange_rate,
      };
    }
    return { status: "unavailable" };
  }

  private async getEurUsdRateSafe(date: string): Promise<number> {
    try {
      return await this.currency.getEurUsdRate(date);
    } catch {
      return 1.1;
    }
  }
}

/** EUR-listed tickers don't need USD→EUR conversion. */
function isEurListing(ticker: string): boolean {
  const eurSuffixes = [".DE", ".AS", ".PA", ".MI", ".MC", ".BR", ".VI", ".LS", ".HE", ".ST", ".CO", ".OL"];
  const upper = ticker.toUpperCase();
  return eurSuffixes.some(s => upper.endsWith(s.toUpperCase()));
}
