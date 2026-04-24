import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { join, normalize, resolve, extname } from "node:path";
import { assetPlugin } from "./routes/assets";
import { exchangePlugin } from "./routes/exchanges";
import { transactionPlugin } from "./routes/transactions";
import { positionPlugin } from "./routes/positions";
import { pricePlugin } from "./routes/prices";
import { netWorthPlugin } from "./routes/net-worth";
import { exportPlugin } from "./routes/export";
import { secretPlugin } from "./routes/secrets";

export function createApp() {
  return new Elysia()
    .use(cors())
    .derive(() => ({ requestStart: Date.now() }))
    .onAfterResponse(({ request, set, requestStart }) => {
      const method = request.method.padEnd(6)
      const path = new URL(request.url).pathname
      const status = set.status ?? 200
      const ms = Date.now() - requestStart
      console.log(`[${new Date().toISOString()}] ${method} ${path} ${status} - ${ms}ms`)
    })
    .use(assetPlugin)
    .use(exchangePlugin)
    .use(transactionPlugin)
    .use(positionPlugin)
    .use(pricePlugin)
    .use(netWorthPlugin)
    .use(exportPlugin)
    .use(secretPlugin)
    // Static file server — only active when STATIC_DIR is set (desktop/Tauri builds).
    // Serves the built frontend and falls back to index.html for SPA routing.
    .get("/*", async ({ request, set }) => {
      const staticDir = process.env["STATIC_DIR"];
      if (!staticDir) {
        set.status = 404;
        return { error: "Not found" };
      }

      const pathname = decodeURIComponent(new URL(request.url).pathname);

      // Prevent path traversal
      const safePath = resolve(join(staticDir, normalize(pathname)));
      if (!safePath.startsWith(resolve(staticDir))) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      let file = Bun.file(safePath);
      if (!(await file.exists())) {
        // SPA fallback — let the React router handle the route
        file = Bun.file(join(staticDir, "index.html"));
      }

      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
      };
      const contentType = mime[extname(safePath)] ?? "application/octet-stream";
      set.headers["content-type"] = contentType;

      return file;
    });
}
