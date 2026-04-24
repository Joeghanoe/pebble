import { Elysia } from "elysia";
import { readFile, access } from "node:fs/promises";

const DB_PATH = process.env["DB_PATH"] ?? "./portfolio.db";

export const exportPlugin = new Elysia({ prefix: "/api/export" })
  .get("/", async ({ set }) => {
    try {
      await access(DB_PATH);
    } catch {
      set.status = 404;
      return { error: "Database file not found" };
    }
    const bytes = await readFile(DB_PATH);
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="portfolio-${new Date().toISOString().slice(0, 10)}.db"`,
        "Content-Length": bytes.byteLength.toString(),
      },
    });
  });
