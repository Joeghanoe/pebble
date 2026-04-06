import { CoinGeckoClient } from "../clients/coingecko";
import { StooqClient } from "../clients/stooq";
import { YahooClient } from "../clients/yahoo";
import { FrankfurterClient } from "../clients/frankfurter";
import { CurrencyService } from "./currency";
import { PriceService } from "./prices";

let _priceService: PriceService | null = null;

export function getPriceService(): PriceService {
  if (_priceService) return _priceService;

  const coingeckoKey = process.env["COINGECKO_API_KEY"] ?? "";

  const coingecko = new CoinGeckoClient(coingeckoKey);
  const stooq     = new StooqClient();
  const yahoo     = new YahooClient();
  const currency  = new CurrencyService(new FrankfurterClient());

  _priceService = new PriceService(coingecko, stooq, yahoo, currency);
  return _priceService;
}

export function resetPriceService(): void {
  _priceService = null;
}
