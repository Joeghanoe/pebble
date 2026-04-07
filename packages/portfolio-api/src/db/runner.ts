import { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_MIGRATIONS } from "./migrations-bundle";

// import.meta.dir is Bun-specific; fall back to Node's import.meta.url
const _dir: string =
  (import.meta as Record<string, unknown>)["dir"] as string ??
  dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(_dir, "migrations");

// Lazily initialised so that callers (e.g. Electron main) can set
// process.env["DB_PATH"] before the database file is actually opened.
let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;
  const dbPath = process.env["DB_PATH"] ?? "./portfolio.db";
  _db = new Database(dbPath, { create: true });
  _db.run("PRAGMA foreign_keys = ON");
  return _db;
}

export const db = new Proxy({} as Database, {
  get(_t, prop) {
    const real = getDb();
    const val = Reflect.get(real, prop, real);
    return typeof val === "function" ? (val as Function).bind(real) : val;
  },
});

export async function runMigrations(database: Database = db): Promise<void> {
  // Ensure schema_migrations table exists
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  // Get already-applied migrations
  const applied = database
    .query<{ filename: string }, []>("SELECT filename FROM schema_migrations ORDER BY filename ASC")
    .all();
  const appliedSet = new Set(applied.map((r) => r.filename));

  // Read migration files — fall back to pre-bundled strings in compiled binaries
  // where the virtual bun FS doesn't support readdir/readFile.
  let migrations: Array<{ filename: string; sql: string }>;
  try {
    const files = await readdir(MIGRATIONS_DIR);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
    migrations = await Promise.all(
      sqlFiles.map(async (filename) => ({
        filename,
        sql: await readFile(join(MIGRATIONS_DIR, filename), "utf-8"),
      }))
    );
  } catch {
    migrations = BUNDLED_MIGRATIONS;
  }

  for (const { filename, sql } of migrations) {
    if (appliedSet.has(filename)) {
      continue;
    }

    // Run migration in a transaction
    const applyMigration = database.transaction(() => {
      database.run(sql);
      database
        .query("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)")
        .run(filename, new Date().toISOString());
    });

    applyMigration();
    console.log(`Applied migration: ${filename}`);
  }
}
