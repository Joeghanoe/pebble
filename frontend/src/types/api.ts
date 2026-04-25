import type { Asset, Exchange, Transaction } from "./db"
import type { PriceResult } from "./price"

export type Position = {
  asset: Asset
  currentValueEur: number
  totalInvestedEur: number
  unitsHeld: number
  pnlPct: number
  priceResult: PriceResult
}

export type NetWorthSnapshot = {
  date: string
  valueEur: number
}

export type GetPositionsResponse = {
  positions: Position[]
}

export type GetNetWorthResponse = {
  snapshots: NetWorthSnapshot[]
}

export type GetTransactionsResponse = {
  transactions: Transaction[]
}

export type GetExchangesResponse = {
  exchanges: Exchange[]
}

export type RefreshPricesResponse = {
  throttled: boolean
}
