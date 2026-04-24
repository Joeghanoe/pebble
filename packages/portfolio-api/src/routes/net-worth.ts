import { Elysia, t } from "elysia";
import { listSnapshotsAggregated } from "../db/queries/snapshots";

export const netWorthPlugin = new Elysia({ prefix: "/api/net-worth" })
  .get("/", ({ query }) => {
    const period = (query.period ?? "1m") as "1d" | "1w" | "1m";
    return { snapshots: listSnapshotsAggregated(period) };
  }, {
    query: t.Object({
      period: t.Optional(t.Union([t.Literal("1d"), t.Literal("1w"), t.Literal("1m")])),
    }),
  });
