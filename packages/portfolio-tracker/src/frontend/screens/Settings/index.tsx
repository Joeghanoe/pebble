import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchJson } from "@/lib/queryClient"
import { api, apiUrl } from "@/lib/api"
import { ApiKeyInput } from "@/frontend/components/ApiKeyInput"
import type { GetExchangesResponse } from "@/types/api"

export function Settings() {
  const queryClient = useQueryClient()
  
  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () => fetchJson<GetExchangesResponse>("/api/exchanges"),
  })

  const [newExchangeName, setNewExchangeName] = useState("")
  const [newExchangeType, setNewExchangeType] = useState<
    "crypto" | "broker" | "manual"
  >("crypto")

  const addExchange = useMutation({
    mutationFn: (body: { name: string; type: string }) =>
      api.createExchange(body),
    onSuccess: () => {
      setNewExchangeName("")
      void queryClient.invalidateQueries({ queryKey: ["exchanges"] })
    },
  })

  const deleteExchange = useMutation({
    mutationFn: (id: number) => api.deleteExchange(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchanges"] })
    },
  })

  const exchanges = exchangesData?.exchanges ?? []

  async function handleAddExchange(e: React.FormEvent) {
    e.preventDefault()
    addExchange.mutate({ name: newExchangeName, type: newExchangeType })
  }

  async function handleDeleteExchange(id: number) {
    if (!confirm("Delete this exchange?")) return
    deleteExchange.mutate(id)
  }

  async function handleExportDb() {
    const a = document.createElement("a")
    a.href = apiUrl("/api/export")
    a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.db`
    a.click()
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            API keys are stored in macOS Keychain via Bun.secrets — never in the
            database or on disk.
          </p>
          <ApiKeyInput
            label="CoinGecko Demo API Key"
            secretName="coingecko-demo-key"
          />
        </CardContent>
      </Card>

      {/* Exchanges */}
      <Card>
        <CardHeader>
          <CardTitle>Exchanges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exchanges.length > 0 && (
            <Table className="mb-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exchanges.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-medium">{ex.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ex.type}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteExchange(ex.id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <form onSubmit={handleAddExchange} className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="exName">Exchange Name</Label>
              <Input
                id="exName"
                value={newExchangeName}
                onChange={(e) => setNewExchangeName(e.target.value)}
                placeholder="e.g. Kraken"
                required
              />
            </div>
            <div>
              <Label htmlFor="exType">Type</Label>
              <select
                id="exType"
                value={newExchangeType}
                onChange={(e) =>
                  setNewExchangeType(
                    e.target.value as "crypto" | "broker" | "manual"
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="crypto">Crypto</option>
                <option value="broker">Broker</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <Button type="submit" disabled={addExchange.isPending}>
              Add Exchange
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle>Data Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Download your SQLite database file. This is the only copy of your
            data.
          </p>
          <Button onClick={handleExportDb} variant="outline">
            Export Database
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
