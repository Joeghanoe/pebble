import { Elysia } from "elysia";
import { listSnapshots } from "../db/queries/snapshots";
import { runSnapshotBackfill } from "../services/snapshots";

export const netWorthPlugin = new Elysia({ prefix: "/api/net-worth" })
  .get("/", async () => {
    await runSnapshotBackfill();
    return { snapshots: listSnapshots() };
  });
