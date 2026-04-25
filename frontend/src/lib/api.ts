import {
  OpenAPI,
  AssetsService,
  ExchangesService,
  PricesService,
  SecretsService,
  TransactionsService,
} from "@/client";
import type { RefreshPricesResponse } from "@/types/api";

export function apiUrl(path: string): string {
  return `${OpenAPI.BASE}${path}`;
}

export const api = {
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
        type: body.type,
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
    ExchangesService.createExchangeApiExchangesPost({ requestBody: body }),

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
        type: body.type,
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
        type: body.type,
        exchange_id: body.exchangeId,
        yahoo_ticker: body.yahooTicker,
        coingecko_id: body.coingeckoId,
      },
    }),

  setSecret: (name: string, value: string) =>
    SecretsService.setSecretApiSecretsNamePost({
      name,
      requestBody: { value },
    }),
};
