import { Elysia, t } from "elysia";
import { listTransactionsByAsset, createTransaction, updateTransaction, softDeleteTransaction, getTransactionById } from "../db/queries/transactions";
import { recalculateFifoForAsset } from "../services/fifo-recalc";

export const transactionPlugin = new Elysia({ prefix: "/api/transactions" })
  .post("/", ({ body, set }) => {
    const { assetId, date, type, units, eurAmount, notes } = body;
    const tx = createTransaction(assetId, date, type, Math.abs(units), Math.abs(eurAmount), notes ?? null);
    recalculateFifoForAsset(assetId);
    set.status = 201;
    return { transaction: tx };
  }, {
    body: t.Object({
      assetId: t.Number({ minimum: 1 }),
      date: t.String({ minLength: 1 }),
      type: t.Union([t.Literal("buy"), t.Literal("sell")]),
      units: t.Number({ minimum: 0 }),
      eurAmount: t.Number({ minimum: 0 }),
      notes: t.Optional(t.String()),
    })
  })
  .get("/:assetId", ({ params, set }) => {
    const assetId = parseInt(params.assetId);
    if (isNaN(assetId)) { set.status = 400; return { error: "Invalid assetId" }; }
    return { transactions: listTransactionsByAsset(assetId) };
  })
  .put("/:id/update", ({ params, body, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    const existing = getTransactionById(id);
    if (!existing) { set.status = 404; return { error: "Not found" }; }
    updateTransaction(id, {
      date: body.date,
      type: body.type,
      units: body.units !== undefined ? Math.abs(body.units) : undefined,
      eur_amount: body.eurAmount !== undefined ? Math.abs(body.eurAmount) : undefined,
      notes: body.notes,
    });
    recalculateFifoForAsset(existing.asset_id);
    return { ok: true };
  }, {
    body: t.Object({
      date: t.Optional(t.String({ minLength: 1 })),
      type: t.Optional(t.Union([t.Literal("buy"), t.Literal("sell")])),
      units: t.Optional(t.Number({ minimum: 0 })),
      eurAmount: t.Optional(t.Number({ minimum: 0 })),
      notes: t.Optional(t.String()),
    })
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
