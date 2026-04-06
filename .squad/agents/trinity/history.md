# Project Context

- **Owner:** Redacted
- **Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, shadcn/ui, Bun | C# 13, .NET 10, Azure Functions (Isolated Worker), Durable Functions, Cosmos DB, Blob/Table Storage, Application Insights | Bicep, Azure Entra ID, Key Vault, Managed Identity
- **Created:** 2026-03-29

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Frontend Architecture (2026-03-29)

**Anti-Patterns Eliminated:**
1. **Module-level mutable state** — Replaced with `useRef()` in Dashboard and PositionDetail. React state belongs inside components, not at module level where it persists across remounts and is shared across instances.
2. **Raw `fetch` in mutations** — Created centralized typed API client in `src/lib/api.ts` with `mutateJson()` helper. All mutation operations now flow through `api.*` methods for consistent error handling and type safety.
3. **Direct `queryClient` imports** — Components now use `useQueryClient()` hook instead of importing the singleton directly. This is the idiomatic React Query pattern.
4. **Missing `Readonly<Props>`** — All component props interfaces now wrapped with `Readonly<>` for immutability guarantees.

**Key Files:**
- `src/lib/api.ts` — API client with typed mutation functions (transactions, assets, prices, secrets, exchanges)
- All frontend components updated to use centralized API client
- No TypeScript errors after refactor (`npx tsc --noEmit` passes)

### Frontend SOC Pass — Extraction (2026-04-06)

**What Was Extracted:**
1. **Format utilities** (`src/lib/format.ts`) — 5 formatting functions (`formatEur`, `formatEurPrice`, `formatUsdPrice`, `formatPct`, `formatUnits`) were duplicated in Dashboard and PositionDetail. Consolidated into single module.
2. **Price refresh hook** (`src/hooks/use-refresh-prices.ts`) — Auto-refresh pattern (cooldown + mutation + invalidation) appeared in both screens. Extracted to hook supporting both global (Dashboard) and per-asset (PositionDetail) cooldowns.
3. **Position analytics** (`src/lib/position-analytics.ts`) — ~60 lines of FIFO lot tracking, transaction enrichment, and chart data building moved from PositionDetail body to pure functions module. Returns typed interfaces for all data shapes.
4. **ApiKeyInput component** (`src/frontend/components/ApiKeyInput.tsx`) — Inline sub-component in Settings moved to own file.

**Result:** Screen files now contain only JSX layout and wiring. Zero business logic, zero utility functions, zero inline sub-components. TypeScript passes with zero errors.

**Key Files:**
- `src/lib/format.ts` — All number/currency formatting functions
- `src/hooks/use-refresh-prices.ts` — Auto-refresh with per-key cooldown
- `src/lib/position-analytics.ts` — Transaction analysis and chart data building
- `src/frontend/components/ApiKeyInput.tsx` — Reusable API key input component
