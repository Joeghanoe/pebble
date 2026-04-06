import type { RefreshPricesResponse } from "@/types/api"

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      getApiPort: () => Promise<number>
      getApiKey: (name: string) => Promise<string | null>
      setApiKey: (name: string, value: string) => Promise<void>
      deleteApiKey: (name: string) => Promise<void>
    }
  }
}

let _base = ""

export async function initApiBase(): Promise<void> {
  if (globalThis.window?.electronAPI?.isElectron) {
    const port = await globalThis.window.electronAPI.getApiPort()
    _base = `http://127.0.0.1:${port}`
  }
}

export function apiUrl(path: string): string {
  return `${_base}${path}`
}

async function mutateJson<T>(
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown
): Promise<T> {
  let hasBody = true
  if (body === undefined) {
    hasBody = false
  }

  const res = await fetch(apiUrl(path), {
    method,
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  createTransaction: (body: {
    assetId: number
    date: string
    type: "buy" | "sell"
    units: number
    eurAmount: number
    notes?: string
  }) => mutateJson<unknown>("POST", "/api/transactions", body),

  updateTransaction: (
    id: number,
    body: {
      date?: string
      type?: "buy" | "sell"
      units?: number
      eurAmount?: number
      notes?: string
    }
  ) => mutateJson<unknown>("PUT", `/api/transactions/${id}/update`, body),

  deleteTransaction: (id: number) =>
    mutateJson<unknown>("DELETE", `/api/transactions/${id}/delete`),

  createAsset: (body: {
    symbol: string
    name: string
    type: "crypto" | "etf" | "cash"
    exchangeId: number
    yahooTicker?: string
    coingeckoId?: string
  }) => mutateJson<unknown>("POST", "/api/assets", body),

  updateAsset: (
    id: number,
    body: {
      symbol?: string
      name?: string
      type?: "crypto" | "etf" | "cash"
      exchangeId?: number
      yahooTicker?: string | null
      coingeckoId?: string | null
    }
  ) => mutateJson<unknown>("PUT", `/api/assets/${id}`, body),

  refreshPrices: () =>
    mutateJson<RefreshPricesResponse>("POST", "/api/prices/refresh"),

  setSecret: (name: string, value: string) =>
    mutateJson<unknown>("POST", `/api/secrets/${name}`, { value }),

  deleteSecret: (name: string) =>
    mutateJson<unknown>("DELETE", `/api/secrets/${name}`),

  createExchange: (body: { name: string; type: string }) =>
    mutateJson<unknown>("POST", "/api/exchanges", body),

  deleteExchange: (id: number) =>
    mutateJson<unknown>("DELETE", `/api/exchanges/${id}`),
}
