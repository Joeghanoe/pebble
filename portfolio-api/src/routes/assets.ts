import { Elysia } from "elysia";
import { listAssets, getAssetById, createAsset, updateAsset } from "../db/queries/assets";
import type { CreateAssetRequest, UpdateAssetRequest } from "../types/api";

export const assetPlugin = new Elysia({ prefix: "/api/assets" })
  .get("/", () => ({ assets: listAssets() }))
  .post("/", ({ body, set }) => {
    const data = body as CreateAssetRequest;
    if (!data.symbol || !data.name || !data.type || !data.exchangeId) {
      set.status = 400;
      return { error: "symbol, name, type, exchangeId required" };
    }
    const asset = createAsset(data.symbol, data.name, data.type, data.exchangeId, data.yahooTicker ?? null, data.coingeckoId ?? null);
    set.status = 201;
    return { asset };
  })
  .get("/:id", ({ params, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    const asset = getAssetById(id);
    if (!asset) { set.status = 404; return { error: "Not found" }; }
    return { asset };
  })
  .put("/:id", ({ params, body, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    const data = body as UpdateAssetRequest;
    updateAsset(id, {
      symbol: data.symbol,
      name: data.name,
      type: data.type,
      exchange_id: data.exchangeId,
      yahoo_ticker: data.yahooTicker,
      coingecko_id: data.coingeckoId,
    });
    const asset = getAssetById(id);
    return { asset };
  });
