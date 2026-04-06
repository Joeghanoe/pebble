import { Elysia } from "elysia";
import { listTransactionsByAsset, createTransaction, updateTransaction, softDeleteTransaction, getTransactionById } from "../db/queries/transactions";
import { recalculateFifoForAsset } from "../services/fifo-recalc";
import type { CreateTransactionRequest, UpdateTransactionRequest } from "../types/api";

export const transactionPlugin = new Elysia({ prefix: "/api/transactions" })
  .post("/", ({ body, set }) => {
    const data = body as CreateTransactionRequest;
    if (!data.assetId || !data.date || !data.type || !data.units || !data.eurAmount) {
      set.status = 400;
      return { error: "assetId, date, type, units, eurAmount required" };
    }
    const tx = createTransaction(data.assetId, data.date, data.type, Math.abs(data.units), Math.abs(data.eurAmount), data.notes ?? null);
    recalculateFifoForAsset(data.assetId);
    set.status = 201;
    return { transaction: tx };
  })
  .get("/:assetId", ({ params, set }) => {
    const assetId = parseInt(params.assetId);
    if (isNaN(assetId)) { set.status = 400; return { error: "Invalid assetId" }; }
    return { transactions: listTransactionsByAsset(assetId) };
  })
  .put("/:id/update", ({ params, body, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    const data = body as UpdateTransactionRequest;
    const existing = getTransactionById(id);
    if (!existing) { set.status = 404; return { error: "Not found" }; }
    updateTransaction(id, {
      date: data.date,
      type: data.type,
      units: data.units !== undefined ? Math.abs(data.units) : undefined,
      eur_amount: data.eurAmount !== undefined ? Math.abs(data.eurAmount) : undefined,
      notes: data.notes,
    });
    recalculateFifoForAsset(existing.asset_id);
    return { ok: true };
  })
  .delete("/:id/delete", ({ params, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    const existing = getTransactionById(id);
    if (!existing) { set.status = 404; return { error: "Not found" }; }
    softDeleteTransaction(id);
    recalculateFifoForAsset(existing.asset_id);
    return { ok: true };
  });
