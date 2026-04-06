import { runMigrations } from "./db/runner";
import { runSnapshotBackfill } from "./services/snapshots";
import { createApp } from "./app";

await runMigrations();
await runSnapshotBackfill();

const app = createApp();
app.listen(3131);

console.log(`Portfolio API running on http://${app.server?.hostname}:${app.server?.port}`);
