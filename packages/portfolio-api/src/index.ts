import { runMigrations } from "./db/runner";
import { runSnapshotBackfill } from "./services/snapshots";
import { createApp } from "./app";

await runMigrations();
await runSnapshotBackfill();

const port = Number(process.env["PORT"] ?? 3131);
const app = createApp();
app.listen(port);

console.log(`Portfolio API running on http://${app.server?.hostname}:${app.server?.port}`);
