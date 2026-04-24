/**
 * Pre-bundled SQL migrations for use in compiled Bun binaries (Tauri sidecar).
 * The `with { type: "text" }` import attribute embeds each file as a string
 * at compile time, since Node.js fs APIs cannot read from the bun virtual FS.
 *
 * When adding a new migration, append an entry here (keep alphabetical order).
 */

// @ts-ignore — import attributes are a stage-3 proposal; TS may warn
import sql001 from "./migrations/001_initial.sql" with { type: "text" };
// @ts-ignore
import sql002 from "./migrations/002_model_improvements.sql" with { type: "text" };

export const BUNDLED_MIGRATIONS: Array<{ filename: string; sql: string }> = [
  { filename: "001_initial.sql", sql: sql001 },
  { filename: "002_model_improvements.sql", sql: sql002 },
];
