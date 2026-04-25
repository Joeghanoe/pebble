import { useState } from "react";
import type React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Asset, Exchange } from "@/types/db";

interface Props {
  readonly asset: Asset;
  readonly exchanges: Exchange[];
}

export function EditPositionModal({ asset, exchanges }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState(asset.symbol);
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState<"crypto" | "etf" | "cash" | "stock">(
    asset.type,
  );
  const [exchangeId, setExchangeId] = useState(asset.exchange_id);
  const [yahooTicker, setYahooTicker] = useState(asset.yahoo_ticker ?? "");
  const [coingeckoId, setCoingeckoId] = useState(asset.coingecko_id ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setSymbol(asset.symbol);
      setName(asset.name);
      setType(asset.type);
      setExchangeId(asset.exchange_id);
      setYahooTicker(asset.yahoo_ticker ?? "");
      setCoingeckoId(asset.coingecko_id ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  }

  const updatePosition = useMutation({
    mutationFn: (body: Parameters<typeof api.updateAsset>[1]) =>
      api.updateAsset(asset.id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      setOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updatePosition.mutate({
      symbol: symbol.toUpperCase(),
      name,
      type,
      exchangeId,
      yahooTicker: yahooTicker.trim() || null,
      coingeckoId: coingeckoId.trim() || null,
    });
  }

  const availableExchanges =
    type === "crypto"
      ? exchanges.filter((e) => e.type === "crypto")
      : exchanges.filter((e) => e.type === "broker" || e.type === "manual");

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Edit position"
        >
          <Pencil size={13} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl">
          <Dialog.Title className="mb-4 text-lg font-semibold">
            Edit Position
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-symbol">Symbol</Label>
                <Input
                  id="edit-symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-type">Type</Label>
                <select
                  id="edit-type"
                  value={type}
                  onChange={(e) =>
                    setType(
                      e.target.value as "crypto" | "etf" | "cash" | "stock",
                    )
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="crypto">Crypto</option>
                  <option value="etf">ETF</option>
                  <option value="stock">Stock</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-exchange">Exchange / Broker</Label>
              <select
                id="edit-exchange"
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
            </div>

            {type === "etf" && (
              <div>
                <Label htmlFor="edit-yahoo">Ticker</Label>
                <Input
                  id="edit-yahoo"
                  value={yahooTicker}
                  onChange={(e) => setYahooTicker(e.target.value)}
                  placeholder="VUAA.AS"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Include the exchange suffix: <code>.AS</code> Amsterdam,{" "}
                  <code>.DE</code> Xetra, <code>.L</code> London,{" "}
                  <code>.PA</code> Paris, etc.
                </p>
              </div>
            )}

            {type === "crypto" && (
              <div>
                <Label htmlFor="edit-coingecko">CoinGecko ID</Label>
                <Input
                  id="edit-coingecko"
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
              <Button type="submit" disabled={updatePosition.isPending}>
                {updatePosition.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
