/**
 * Node.js-compatible HTTP server — used as the Electron sidecar.
 * When bundled by esbuild for Electron, `bun:sqlite` is aliased to
 * `./db/sqlcipher-compat.ts` so all DB queries work with SQLCipher.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile, access } from "node:fs/promises";
import { runMigrations } from "./db/runner";
import { runSnapshotBackfill } from "./services/snapshots";
import { listExchanges, createExchange, deleteExchange, getExchangeById } from "./db/queries/exchanges";
import { listAssets, getAssetById, createAsset, updateAsset } from "./db/queries/assets";
import {
  listTransactionsByAsset,
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
  getTransactionById,
} from "./db/queries/transactions";
import { getLatestPrice } from "./db/queries/prices";
import { listSnapshots } from "./db/queries/snapshots";
import { getPriceService } from "./services/price-service-factory";
import { recalculateFifoForAsset } from "./services/fifo-recalc";
import { db } from "./db/runner";
import type { PositionRow, CreateAssetRequest, UpdateAssetRequest, CreateExchangeRequest, CreateTransactionRequest, UpdateTransactionRequest, RefreshPricesResponse } from "./types/api";

const DB_PATH = process.env["DB_PATH"] ?? "./portfolio.db";
const SERVICE = "com.portfolio-tracker.desktop";

// ── Route registry ────────────────────────────────────────────────────────────

type Handler = (req: Request) => Response | Promise<Response>;
type Methods = { [method: string]: Handler };

const routes: Array<{ pattern: string; handlers: Methods }> = [
  { pattern: "/api/exchanges", handlers: {
    GET: () => Response.json({ exchanges: listExchanges() }),
    POST: async (req) => {
      const data = await req.json() as CreateExchangeRequest;
      if (!data.name || !data.type) return Response.json({ error: "name and type required" }, { status: 400 });
      const exchange = createExchange(data.name, data.type);
      return Response.json({ exchange }, { status: 201 });
    },
  }},
  { pattern: "/api/exchanges/:id", handlers: {
    DELETE: (req) => {
      const id = parseInt((req as any).params.id);
      if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      deleteExchange(id);
      return Response.json({ ok: true });
    },
  }},
  { pattern: "/api/assets", handlers: {
    GET: () => Response.json({ assets: listAssets() }),
    POST: async (req) => {
      const data = await req.json() as CreateAssetRequest;
      if (!data.symbol || !data.name || !data.type || !data.exchangeId) return Response.json({ error: "symbol, name, type, exchangeId required" }, { status: 400 });
      const asset = createAsset(data.symbol, data.name, data.type, data.exchangeId, data.yahooTicker ?? null, data.coingeckoId ?? null);
      return Response.json({ asset }, { status: 201 });
    },
  }},
  { pattern: "/api/assets/:id", handlers: {
    GET: (req) => {
      const id = parseInt((req as any).params.id);
      if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      const asset = getAssetById(id);
      if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json({ asset });
    },
    PUT: async (req) => {
      const id = parseInt((req as any).params.id);
      if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      const data = await req.json() as UpdateAssetRequest;
      updateAsset(id, { symbol: data.symbol, name: data.name, type: data.type, exchange_id: data.exchangeId, yahoo_ticker: data.yahooTicker, coingecko_id: data.coingeckoId });
      return Response.json({ asset: getAssetById(id) });
    },
  }},
  { pattern: "/api/transactions", handlers: {
    POST: async (req) => {
      const data = await req.json() as CreateTransactionRequest;
      if (!data.assetId || !data.date || !data.type || !data.units || !data.eurAmount) return Response.json({ error: "assetId, date, type, units, eurAmount required" }, { status: 400 });
      const tx = createTransaction(data.assetId, data.date, data.type, Math.abs(data.units), Math.abs(data.eurAmount), data.notes ?? null);
      recalculateFifoForAsset(data.assetId);
      return Response.json({ transaction: tx }, { status: 201 });
    },
  }},
  { pattern: "/api/transactions/:assetId", handlers: {
    GET: (req) => {
      const assetId = parseInt((req as any).params.assetId);
      if (isNaN(assetId)) return Response.json({ error: "Invalid assetId" }, { status: 400 });
      return Response.json({ transactions: listTransactionsByAsset(assetId) });
    },
  }},
  { pattern: "/api/transactions/:id/update", handlers: {
    PUT: async (req) => {
      const id = parseInt((req as any).params.id);
      if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      const data = await req.json() as UpdateTransactionRequest;
      const existing = getTransactionById(id);
      if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
      updateTransaction(id, { date: data.date, type: data.type, units: data.units !== undefined ? Math.abs(data.units) : undefined, eur_amount: data.eurAmount !== undefined ? Math.abs(data.eurAmount) : undefined, notes: data.notes });
      recalculateFifoForAsset(existing.asset_id);
      return Response.json({ ok: true });
    },
  }},
  { pattern: "/api/transactions/:id/delete", handlers: {
    DELETE: (req) => {
      const id = parseInt((req as any).params.id);
      if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      const existing = getTransactionById(id);
      if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
      softDeleteTransaction(id);
      recalculateFifoForAsset(existing.asset_id);
      return Response.json({ ok: true });
    },
  }},
  { pattern: "/api/positions", handlers: {
    GET: () => {
      const assets = listAssets();
      const today = new Date().toISOString().slice(0, 10);
      const positions: PositionRow[] = [];
      for (const asset of assets) {
        const exchange = getExchangeById(asset.exchange_id);
        if (!exchange) continue;
        const summary = db.query<{ total_invested: number; units_bought: number; units_sold: number; realized_pnl: number }, [number]>(
          `SELECT COALESCE(SUM(CASE WHEN type='buy' THEN ABS(eur_amount) ELSE 0 END),0)-COALESCE(SUM(CASE WHEN type='sell' THEN ABS(eur_amount) ELSE 0 END),0) as total_invested,COALESCE(SUM(CASE WHEN type='buy' THEN ABS(units) ELSE 0 END),0) as units_bought,COALESCE(SUM(CASE WHEN type='sell' THEN ABS(units) ELSE 0 END),0) as units_sold,COALESCE(SUM(CASE WHEN type='sell' THEN COALESCE(realized_pnl,0) ELSE 0 END),0) as realized_pnl FROM transactions WHERE asset_id=? AND deleted_at IS NULL`
        ).get(asset.id);
        const unitsBought = summary?.units_bought ?? 0;
        const unitsHeld = unitsBought - (summary?.units_sold ?? 0);
        const totalInvested = summary?.total_invested ?? 0;
        const realizedPnl = summary?.realized_pnl ?? 0;
        if ((unitsBought > 0 || totalInvested > 0) && unitsHeld <= 0) continue;
        const latestPrice = getLatestPrice(asset.id);
        let priceResult: PositionRow["priceResult"];
        let currentValueEur = 0;
        if (!latestPrice) { priceResult = { status: "unavailable" }; }
        else if (latestPrice.date === today) { priceResult = { status: "ok", priceEur: latestPrice.price_eur, date: latestPrice.date, exchangeRate: latestPrice.exchange_rate }; currentValueEur = unitsHeld * latestPrice.price_eur; }
        else { priceResult = { status: "stale", priceEur: latestPrice.price_eur, lastKnownDate: latestPrice.date, exchangeRate: latestPrice.exchange_rate }; currentValueEur = unitsHeld * latestPrice.price_eur; }
        const pnlPct = totalInvested > 0 ? ((currentValueEur - totalInvested) / totalInvested) * 100 : 0;
        positions.push({ asset, exchange, unitsHeld, totalInvestedEur: totalInvested, currentValueEur, pnlPct, realizedPnl, priceResult });
      }
      const lastUpdatedRow = db.query<{ date: string }, []>("SELECT MAX(date) as date FROM price_cache").get();
      return Response.json({ positions, lastUpdated: lastUpdatedRow?.date ?? null });
    },
  }},
  { pattern: "/api/prices/refresh", handlers: {
    POST: async () => {
      const assets = listAssets();
      const priceService = getPriceService();
      const results: RefreshPricesResponse["results"] = [];
      for (const asset of assets) {
        const result = await priceService.fetchLivePrice(asset);
        results.push({ assetId: asset.id, symbol: asset.symbol, result });
      }
      return Response.json({ results });
    },
  }},
  { pattern: "/api/net-worth", handlers: {
    GET: async () => {
      await runSnapshotBackfill();
      return Response.json({ snapshots: listSnapshots() });
    },
  }},
  { pattern: "/api/export", handlers: {
    GET: async () => {
      try { await access(DB_PATH); } catch { return Response.json({ error: "Database file not found" }, { status: 404 }); }
      const bytes = await readFile(DB_PATH);
      return new Response(bytes.buffer as ArrayBuffer, { headers: { "Content-Type": "application/x-sqlite3", "Content-Disposition": `attachment; filename="portfolio-${new Date().toISOString().slice(0, 10)}.db"`, "Content-Length": bytes.byteLength.toString() } });
    },
  }},
  { pattern: "/api/secrets/:name", handlers: {
    POST: async (req) => {
      const name = (req as any).params.name as string;
      const data = await req.json() as { value?: unknown };
      if (typeof data.value !== "string") return Response.json({ error: "value must be a string" }, { status: 400 });
      try {
        const { default: keytar } = await import("keytar");
        await keytar.setPassword(SERVICE, name, data.value);
      } catch { /* ignore in dev */ }
      process.env[`SECRET_${name.toUpperCase().replace(/-/g,"_")}`] = data.value;
      if (name === "coingecko-api-key") process.env["COINGECKO_API_KEY"] = data.value;
      return Response.json({ ok: true });
    },
    DELETE: async (req) => {
      const name = (req as any).params.name as string;
      try {
        const { default: keytar } = await import("keytar");
        await keytar.deletePassword(SERVICE, name);
      } catch { /* ignore */ }
      delete process.env[`SECRET_${name.toUpperCase().replace(/-/g,"_")}`];
      if (name === "coingecko-api-key") delete process.env["COINGECKO_API_KEY"];
      return Response.json({ ok: true });
    },
  }},
];

// ── Path matcher ──────────────────────────────────────────────────────────────

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const pp = pattern.split("/");
  const rp = pathname.split("/");
  if (pp.length !== rp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) { params[pp[i].slice(1)] = decodeURIComponent(rp[i]); }
    else if (pp[i] !== rp[i]) return null;
  }
  return params;
}

// ── Node ↔ Web API bridge ─────────────────────────────────────────────────────

async function nodeToRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody
    ? await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      })
    : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : (v as string));
  }
  return new Request(url.toString(), { method: req.method ?? "GET", headers, body: body?.length ? (body as unknown as BodyInit) : undefined });
}

async function writeResponse(webRes: Response, res: ServerResponse): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader("Access-Control-Allow-Origin", "*");
  const buf = await webRes.arrayBuffer();
  res.end(Buffer.from(buf));
}

// ── Server ────────────────────────────────────────────────────────────────────

export async function startServer(port = 3131): Promise<{ port: number }> {
  await runMigrations();
  await runSnapshotBackfill();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      res.end();
      return;
    }

    for (const { pattern, handlers } of routes) {
      const params = matchRoute(pattern, pathname);
      if (params === null) continue;
      const handler = handlers[method];
      if (!handler) { res.writeHead(405, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Method Not Allowed" })); return; }
      try {
        const webReq = await nodeToRequest(req, url);
        Object.defineProperty(webReq, "params", { value: params, writable: false });
        const webRes = await handler(webReq);
        await writeResponse(webRes, res);
      } catch (err) {
        console.error("Route handler error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`[sidecar] API listening on http://127.0.0.1:${port}`);
  return { port };
}
