import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ExchangesService } from "@/client";
import { api, apiUrl, SIGN_OUT_URL } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import type { GetExchangesResponse } from "@/types/api";

export function Settings() {
  const queryClient = useQueryClient();

  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () =>
      ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(),
  });

  const [newExchangeName, setNewExchangeName] = useState("");
  const [newExchangeType, setNewExchangeType] = useState<
    "crypto" | "broker" | "manual"
  >("crypto");

  const addExchange = useMutation({
    mutationFn: (body: { name: string; type: string }) =>
      api.createExchange(body),
    onSuccess: () => {
      setNewExchangeName("");
      void queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not add that exchange.")),
  });

  const deleteExchange = useMutation({
    mutationFn: (id: number) => api.deleteExchange(id),
    onSuccess: () => {
      toast.success("Exchange deleted.");
      void queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    },
    // A 409 names the positions still pointing at this exchange, which is the whole
    // reason the endpoint returns one instead of a bare 500.
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not delete that exchange.")),
  });

  const exchanges = exchangesData?.exchanges ?? [];

  function handleAddExchange(e: React.FormEvent) {
    e.preventDefault();
    addExchange.mutate({ name: newExchangeName, type: newExchangeType });
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold sm:text-2xl">Settings</h1>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {me?.email || "Signed in"}
            </p>
            <p className="text-xs text-muted-foreground">
              Signed in with Google through the auth proxy.
            </p>
          </div>
          <Button variant="outline" size="lg" asChild>
            <a href={SIGN_OUT_URL}>Sign out</a>
          </Button>
        </CardContent>
      </Card>

      {/* Exchanges */}
      <Card>
        <CardHeader>
          <CardTitle>Exchanges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exchanges.length > 0 && (
            <div className="-mx-2 overflow-x-auto sm:mx-0">
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
                        <ConfirmButton
                          title={`Delete ${ex.name}?`}
                          description="The exchange is removed. Positions held on it have to be deleted or moved first."
                          onConfirm={() => deleteExchange.mutateAsync(ex.id)}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive text-destructive hover:bg-destructive/10"
                          >
                            Delete
                          </Button>
                        </ConfirmButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <form
            onSubmit={handleAddExchange}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
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
                    e.target.value as "crypto" | "broker" | "manual",
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="crypto">Crypto</option>
                <option value="broker">Broker</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <Button type="submit" size="lg" disabled={addExchange.isPending}>
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
            Download every exchange, position, transaction and net-worth
            snapshot as JSON. Deleted transactions are included, so the export
            is a complete backup.
          </p>
          {/* A plain link: the response carries its own Content-Disposition, and the
              browser handles the save without any script. */}
          <Button variant="outline" size="lg" asChild>
            <a href={apiUrl("/api/export/")}>Export data</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
