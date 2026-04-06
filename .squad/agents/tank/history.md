# Project Context

- **Owner:** Redacted
- **Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, shadcn/ui, Bun | C# 13, .NET 10, Azure Functions (Isolated Worker), Durable Functions, Cosmos DB, Blob/Table Storage, Application Insights | Bicep, Azure Entra ID, Key Vault, Managed Identity
- **Created:** 2026-03-29

## Learnings

- **2026-04-06:** API Hardening Complete — Replaced all `body as X` type casts with Elysia schema validation using `t.Object()` for runtime type safety. Extracted position calculation logic from route handler into dedicated `services/positions.ts` and moved raw SQL queries to `db/queries/transactions.ts` following existing architecture patterns. Removed side-effect from `GET /api/net-worth` (backfill already runs at startup). Added `resetPriceService()` calls when coingecko-api-key secret changes to ensure singleton uses updated credentials. All routes now follow SOLID principles with clear separation of concerns: routes handle HTTP, services contain business logic, queries handle data access.