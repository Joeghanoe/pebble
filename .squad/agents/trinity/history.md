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

### Tauri v2 Vite Integration (2026-04-06)

Configured Vite for Tauri v2 desktop app compatibility while preserving all existing React + Tailwind setup. Key additions: fixed port (5173) with `strictPort`, conditional HMR for mobile dev via `TAURI_DEV_HOST`, platform-specific build targets (chrome105/safari13), debug-aware minification/sourcemaps, and Rust file watching exclusion. The existing `/api` proxy remains functional in both standalone and Tauri dev modes.

### Build Target Update for Recharts v3 (2026-04-06)

Updated Vite build target from `safari13` to `safari16` to fix build failure with recharts v3.8.1. Recharts v3 uses modern JavaScript features (destructuring in class properties, private fields) that esbuild cannot transform to `safari13`. The `safari16` target (Sept 2022) is safe for all macOS versions that can run Tauri v2, which requires macOS 12+ with WKWebView that supports Safari 15/16+ features. This resolves the esbuild transformation error: "Transforming destructuring to the configured target environment is not supported yet".

### Biometric Authentication Gate (2026-04-06)

Created a production security gate pattern using `@choochmeque/tauri-plugin-biometry-api` that blocks all app access until biometric authentication succeeds. Key design decisions:

1. **Dev Mode Bypass** — `import.meta.env.DEV` check returns children immediately, preserving fast dev workflow without breaking HMR.
2. **Graceful Degradation** — When biometrics unavailable (desktop without TouchID/FaceID), shows persistent warning banner but allows access. Security warning is visible but doesn't lock out users on unsupported hardware.
3. **Provider Order** — Gate sits INSIDE `<ThemeProvider>` so auth UI respects theme, but WRAPS `<RouterProvider>` so no routes render until auth succeeds.
4. **State Machine** — Four states: `loading` (spinner), `success` (render children), `error` (retry button), `no-biometry` (warning banner + children). Each state has clear UI with shadcn components.
5. **Dynamic Import** — Biometry API imported conditionally to avoid errors in non-Tauri environments (web preview, tests).

**Key Files:**
- `src/components/BiometricGate.tsx` — Auth gate component with state machine
- `src/main.tsx` — Wraps RouterProvider with BiometricGate inside ThemeProvider
