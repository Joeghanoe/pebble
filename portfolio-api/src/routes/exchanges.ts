import { Elysia, t } from "elysia";
import { listExchanges, createExchange, deleteExchange } from "../db/queries/exchanges";

export const exchangePlugin = new Elysia({ prefix: "/api/exchanges" })
  .get("/", () => ({ exchanges: listExchanges() }))
  .post("/", ({ body, set }) => {
    const { name, type } = body;
    const exchange = createExchange(name, type);
    set.status = 201;
    return { exchange };
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      type: t.Union([t.Literal("crypto"), t.Literal("broker"), t.Literal("manual")]),
    })
  })
  .delete("/:id", ({ params, set }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) { set.status = 400; return { error: "Invalid id" }; }
    deleteExchange(id);
    return { ok: true };
  });
