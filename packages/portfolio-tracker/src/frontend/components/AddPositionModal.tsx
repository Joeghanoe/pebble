import { useState, useEffect } from "react"
import type React from "react"
import { useMutation } from "@tanstack/react-query"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { queryClient } from "@/lib/queryClient"
import { apiUrl } from "@/lib/api"
import type { Exchange } from "@/types/db"

interface Props {
  exchanges: Exchange[]
  children?: React.ReactNode
}

function defaultExchangeForType(
  type: "crypto" | "etf" | "cash",
  exchanges: Exchange[]
): number {
  if (type === "crypto") {
    return (
      exchanges.find((e) => e.type === "crypto")?.id ?? exchanges[0]?.id ?? 1
    )
  }
  // etf / cash → prefer broker or manual
  return (
    exchanges.find((e) => e.type === "broker")?.id ??
    exchanges.find((e) => e.type === "manual")?.id ??
    exchanges[0]?.id ??
    1
  )
}

function exchangesForType(
  type: "crypto" | "etf" | "cash",
  exchanges: Exchange[]
): Exchange[] {
  if (type === "crypto") return exchanges.filter((e) => e.type === "crypto")
  // etf / cash can use broker or manual exchanges
  const filtered = exchanges.filter(
    (e) => e.type === "broker" || e.type === "manual"
  )
  return filtered.length > 0 ? filtered : exchanges
}

export function AddPositionModal({ exchanges, children }: Props) {
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState<"crypto" | "etf" | "cash">("crypto")
  const [exchangeId, setExchangeId] = useState<number>(() =>
    defaultExchangeForType("crypto", exchanges)
  )
  const [yahooTicker, setYahooTicker] = useState("")
  const [coingeckoId, setCoingeckoId] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Auto-select a sensible exchange whenever the type changes
  useEffect(() => {
    setExchangeId(defaultExchangeForType(type, exchanges))
  }, [type, exchanges])

  function handleTypeChange(newType: "crypto" | "etf" | "cash") {
    setType(newType)
    // Clear fields that don't apply to the new type
    if (newType !== "etf") setYahooTicker("")
    if (newType !== "crypto") setCoingeckoId("")
  }

  function resetForm() {
    setSymbol("")
    setName("")
    setYahooTicker("")
    setCoingeckoId("")
    setType("crypto")
    setError(null)
  }

  const createPosition = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(apiUrl("/api/assets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error: string }
        throw new Error(err.error)
      }
      return res.json()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
      setOpen(false)
      resetForm()
    },
    onError: (err) => setError(err.message),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    createPosition.mutate({
      symbol: symbol.toUpperCase(),
      name,
      type,
      exchangeId,
      yahooTicker: yahooTicker || undefined,
      coingeckoId: coingeckoId || undefined,
    })
  }

  const availableExchanges = exchangesForType(type, exchanges)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) resetForm()
      }}
    >
      <Dialog.Trigger asChild>
        {children ?? <Button>+ Add Position</Button>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl">
          <Dialog.Title className="mb-4 text-lg font-semibold">
            Add New Position
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder={
                    type === "crypto" ? "BTC" : type === "etf" ? "VUAA" : "EUR"
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="assetType">Type</Label>
                <select
                  id="assetType"
                  value={type}
                  onChange={(e) =>
                    handleTypeChange(
                      e.target.value as "crypto" | "etf" | "cash"
                    )
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="crypto">Crypto</option>
                  <option value="etf">ETF</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === "crypto"
                    ? "Bitcoin"
                    : type === "etf"
                      ? "Vanguard S&P 500 UCITS ETF"
                      : "Cash"
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="exchangeId">Exchange / Broker</Label>
              <select
                id="exchangeId"
                value={exchangeId}
                onChange={(e) => setExchangeId(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {availableExchanges.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              {availableExchanges.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No {type === "crypto" ? "crypto" : "broker/manual"} exchanges
                  found. Add one in Settings first.
                </p>
              )}
            </div>

            {type === "etf" && (
              <div>
                <Label htmlFor="yahooTicker">Ticker</Label>
                <Input
                  id="yahooTicker"
                  value={yahooTicker}
                  onChange={(e) => setYahooTicker(e.target.value)}
                  placeholder="VUAA.L"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Yahoo Finance format (e.g. VUAA.L, VWCE.DE, SPY). Used for
                  live price fetching.
                </p>
              </div>
            )}

            {type === "crypto" && (
              <div>
                <Label htmlFor="coingeckoId">CoinGecko ID</Label>
                <Input
                  id="coingeckoId"
                  value={coingeckoId}
                  onChange={(e) => setCoingeckoId(e.target.value)}
                  placeholder="bitcoin"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowercase slug from CoinGecko (e.g. "bitcoin", "ethereum").
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                disabled={
                  createPosition.isPending || availableExchanges.length === 0
                }
              >
                {createPosition.isPending ? "Adding…" : "Add Position"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
