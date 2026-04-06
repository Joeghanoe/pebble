# Team Decisions

## 2026-03-29T19:23:16Z: User directive

**By:** Joe (via Copilot)  
**What:** Do not automatically commit or push changes. Agents should make file edits but leave git operations to the user.  
**Why:** User request — captured for team memory

---

## 2026-04-06: Frontend Hardening

**Author:** Trinity (Frontend Dev)  
**Status:** ✅ Completed

### Decision: Separation of Concerns (SOC) for Frontend

Extract all reused logic, inline utilities, and sub-components from screen files. Each screen contains only JSX layout and wiring — no business logic, no utility functions, no inline components.

### Extractions

1. **Format Utilities** (`src/lib/format.ts`)
   - **Problem:** 5 formatting functions duplicated between Dashboard and PositionDetail
   - **Solution:** Consolidated into single module
   - **Functions:** `formatEur`, `formatEurPrice`, `formatUsdPrice`, `formatPct`, `formatUnits`

2. **Price Refresh Hook** (`src/hooks/use-refresh-prices.ts`)
   - **Problem:** Auto-refresh pattern (cooldown + mutation + invalidation) duplicated in both screens
   - **Solution:** Custom hook with per-key cooldown support
   - **Usage:** Global cooldown (Dashboard) and per-asset cooldown (PositionDetail)

3. **Position Analytics** (`src/lib/position-analytics.ts`)
   - **Problem:** ~60 lines of transaction analysis inline in PositionDetail component body
   - **Solution:** Pure functions module with typed interfaces
   - **Capabilities:** FIFO lot tracking, transaction enrichment, chart data building
   - **Functions:** `enrichTransactions`, `getOpenBuyTransactions`, `buildPnlChartData`, `buildValueChartData`, `buildFrequencyData`, `calcPositionTotals`

4. **ApiKeyInput Component** (`src/frontend/components/ApiKeyInput.tsx`)
   - **Problem:** Inline sub-component in Settings screen
   - **Solution:** Moved to own file with `Readonly<Props>`

### Verification

✅ `npx tsc --noEmit` passes with zero errors

### Governance

Follows Trinity's charter principle A.12: "Components have a single, clear responsibility"
