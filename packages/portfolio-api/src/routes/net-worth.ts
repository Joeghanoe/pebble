import { Elysia } from "elysia";
import { listSnapshots } from "../db/queries/snapshots";

export const netWorthPlugin = new Elysia({ prefix: "/api/net-worth" })
  .get("/", () => ({ snapshots: listSnapshots() }));
