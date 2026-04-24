import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

interface Props {
  assetId: number
  trigger?: React.ReactNode
}

export function AddTransactionModal({ assetId, trigger }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<"buy" | "sell">("buy")
  const [units, setUnits] = useState("")
  const [eurAmount, setEurAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const createTx = useMutation({
    mutationFn: (body: Parameters<typeof api.createTransaction>[0]) =>
      api.createTransaction(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["transactions", assetId],
      })
      void queryClient.invalidateQueries({ queryKey: ["positions"] })
      setOpen(false)
      setUnits("")
      setEurAmount("")
      setNotes("")
    },
    onError: (err) => setError(err.message),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    createTx.mutate({
      assetId,
      date,
      type,
      units: parseFloat(units),
      eurAmount: parseFloat(eurAmount),
      notes: notes || undefined,
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {trigger ?? <Button size="sm">+ Add Transaction</Button>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl">
          <Dialog.Title className="mb-4 text-lg font-semibold">
            Add Transaction
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="txDate">Date</Label>
                <Input
                  id="txDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="txType">Type</Label>
                <select
                  id="txType"
                  value={type}
                  onChange={(e) => setType(e.target.value as "buy" | "sell")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="txUnits">Units</Label>
                <Input
                  id="txUnits"
                  type="number"
                  step="any"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  placeholder="0.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="txEur">EUR Amount</Label>
                <Input
                  id="txEur"
                  type="number"
                  step="any"
                  value={eurAmount}
                  onChange={(e) => setEurAmount(e.target.value)}
                  placeholder="500"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="txNotes">Notes (optional)</Label>
              <Input
                id="txNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={createTx.isPending}>
                {createTx.isPending ? "Saving..." : "Add Transaction"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
