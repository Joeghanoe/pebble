/**
 * One-shot migration runner. Run from the portfolio-api package:
 *   DB_PATH="/Users/joeghanoe/Library/Application Support/com.pebble.desktop/portfolio.db" bun run migrate.ts
 */

import { runMigrations } from "./src/db/runner";

console.log("DB_PATH:", process.env["DB_PATH"]);
console.log("Running migrations...");

try {
  await runMigrations();
  console.log("Migrations complete.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
