import { Elysia, t } from "elysia";
import { listAssets, getAssetById, createAsset, updateAsset } from "../db/queries/assets";

export const assetPlugin = new Elysia({ prefix: "/api/assets" })
  .get("/", () => ({ assets: listAssets() }))
  .post("/", ({ body, set }) => {
    const { symbol, name, type, exchangeId, yahooTicker, coingeckoId } = body;
    const asset = createAsset(symbol, name, type, exchangeId, yahooTicker ?? null, coingeckoId ?? null);
    set.status = 201;
    return { asset };
  }, {
    body: t.Object({
      symbol: t.String({ minLength: 1 }),
      name: t.String({ minLength: 1 }),
      type: t.Union([t.Literal("crypto"), t.Literal("etf"), t.Literal("cash")]),
      exchangeId: t.Number({ minimum: 1 }),
      yahooTicker: t.Optional(t.String()),
      coingeckoId: t.Optional(t.String()),
    })
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
    updateAsset(id, {
      symbol: body.symbol,
      name: body.name,
      type: body.type,
      exchange_id: body.exchangeId,
      yahoo_ticker: body.yahooTicker,
      coingecko_id: body.coingeckoId,
    });
    const asset = getAssetById(id);
    return { asset };
  }, {
    body: t.Object({
      symbol: t.Optional(t.String({ minLength: 1 })),
      name: t.Optional(t.String({ minLength: 1 })),
      type: t.Optional(t.Union([t.Literal("crypto"), t.Literal("etf"), t.Literal("cash")])),
      exchangeId: t.Optional(t.Number({ minimum: 1 })),
      yahooTicker: t.Optional(t.Nullable(t.String())),
      coingeckoId: t.Optional(t.Nullable(t.String())),
    })
  });
