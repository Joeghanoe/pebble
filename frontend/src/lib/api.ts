import {
  OpenAPI,
  AssetsService,
  ExchangesService,
  MeService,
  PricesService,
  TransactionsService,
} from "@/client";
import type { RefreshPricesResponse } from "@/types/api";

export function apiUrl(path: string): string {
  return `${OpenAPI.BASE}${path}`;
}

/** Where oauth2-proxy ends the session. Served on the same origin as the app. */
export const SIGN_OUT_URL = "/oauth2/sign_out";

export const api = {
  getMe: (): Promise<{ email: string }> =>
    MeService.getMeApiMeGet() as unknown as Promise<{ email: string }>,

  refreshPrices: (): Promise<RefreshPricesResponse> =>
    PricesService.refreshPricesApiPricesRefreshPost() as unknown as Promise<RefreshPricesResponse>,

  createTransaction: (body: {
    assetId: number;
    date: string;
    type: string;
    units: number;
    eurAmount: number;
    notes?: string;
  }) =>
    TransactionsService.createTransactionApiTransactionsPost({
      requestBody: {
        asset_id: body.assetId,
        date: body.date,
        type: body.type as "buy" | "sell",
        units: body.units,
        eur_amount: body.eurAmount,
        notes: body.notes ?? null,
      },
    }),

  deleteTransaction: (txId: number) =>
    TransactionsService.deleteTransactionApiTransactionsTxIdDeleteDelete({
      txId,
    }),

  createExchange: (body: { name: string; type: string }) =>
    ExchangesService.createExchangeApiExchangesPost({
      requestBody: {
        name: body.name,
        type: body.type as "crypto" | "broker" | "manual",
      },
    }),

  deleteExchange: (exchangeId: number) =>
    ExchangesService.deleteExchangeApiExchangesExchangeIdDelete({ exchangeId }),

  createAsset: (body: {
    symbol: string;
    name: string;
    type: string;
    exchangeId: number;
    yahooTicker?: string | null;
    coingeckoId?: string | null;
  }) =>
    AssetsService.createAssetApiAssetsPost({
      requestBody: {
        symbol: body.symbol,
        name: body.name,
        type: body.type as "crypto" | "etf" | "cash" | "stock",
        exchange_id: body.exchangeId,
        yahoo_ticker: body.yahooTicker,
        coingecko_id: body.coingeckoId,
      },
    }),

  updateAsset: (
    assetId: number,
    body: {
      symbol?: string | null;
      name?: string | null;
      type?: string | null;
      exchangeId?: number | null;
      yahooTicker?: string | null;
      coingeckoId?: string | null;
    },
  ) =>
    AssetsService.updateAssetApiAssetsAssetIdPut({
      assetId,
      requestBody: {
        symbol: body.symbol,
        name: body.name,
        type: body.type as "crypto" | "etf" | "cash" | "stock" | null,
        exchange_id: body.exchangeId,
        yahoo_ticker: body.yahooTicker,
        coingecko_id: body.coingeckoId,
      },
    }),

  /** Deletes the position outright, with its transactions, prices and snapshots. */
  deleteAsset: (assetId: number) =>
    AssetsService.deleteAssetApiAssetsAssetIdDelete({ assetId }),
};
