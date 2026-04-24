import { Elysia } from "elysia";
import { listAssets } from "../db/queries/assets";
import { getPriceService } from "../services/price-service-factory";
import { runTodaySnapshot } from "../services/snapshots";
import type { RefreshPricesResponse } from "../types/api";

const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

let lastRefreshAt = 0;
let activeRefresh: Promise<RefreshPricesResponse> | null = null;

export const pricePlugin = new Elysia({ prefix: "/api/prices" })
  .post("/refresh", async () => {
    const now = Date.now();

    if (activeRefresh) {
      return {
        throttled: true,
        reason: "in_progress",
        nextAllowedAt: new Date(lastRefreshAt + REFRESH_COOLDOWN_MS).toISOString(),
        results: [],
      } satisfies RefreshPricesResponse;
    }

    if (lastRefreshAt > 0 && now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
      return {
        throttled: true,
        reason: "cooldown",
        nextAllowedAt: new Date(lastRefreshAt + REFRESH_COOLDOWN_MS).toISOString(),
        results: [],
      } satisfies RefreshPricesResponse;
    }

    activeRefresh = (async () => {
      const assets = listAssets();
      const priceService = getPriceService();
      const results: RefreshPricesResponse["results"] = [];

      for (const asset of assets) {
        const result = await priceService.fetchLivePrice(asset);
        results.push({ assetId: asset.id, symbol: asset.symbol, result });
      }

      lastRefreshAt = Date.now();
      await runTodaySnapshot();
      return {
        throttled: false,
        results,
      } satisfies RefreshPricesResponse;
    })();

    try {
      return await activeRefresh;
    } finally {
      activeRefresh = null;
    }
  });
