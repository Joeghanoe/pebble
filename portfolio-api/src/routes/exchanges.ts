import { Elysia } from "elysia";
import { listExchanges, createExchange, deleteExchange } from "../db/queries/exchanges";
import type { CreateExchangeRequest } from "../types/api";

export const exchangePlugin = new Elysia({ prefix: "/api/exchanges" })
  .get("/", () => ({ exchanges: listExchanges() }))
  .post("/", ({ body, set }) => {
    const data = body as CreateExchangeRequest;
    if (!data.name || !data.type) { set.status = 400; return { error: "name and type are required" }; }
    const exchange = createExchange(data.name, data.type);
    set.status = 201;
    return { exchange };
  })
  .delete("/:id", ({ params, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    deleteExchange(id);
    return { ok: true };
  });
