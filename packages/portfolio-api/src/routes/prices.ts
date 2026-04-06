import { Elysia } from "elysia";
import { listAssets } from "../db/queries/assets";
import { getPriceService } from "../services/price-service-factory";
import type { RefreshPricesResponse } from "../types/api";

export const pricePlugin = new Elysia({ prefix: "/api/prices" })
  .post("/refresh", async () => {
    const assets = listAssets();
    const priceService = getPriceService();
    const results: RefreshPricesResponse["results"] = [];
    for (const asset of assets) {
      const result = await priceService.fetchLivePrice(asset);
      results.push({ assetId: asset.id, symbol: asset.symbol, result });
    }
    return { results };
  });
