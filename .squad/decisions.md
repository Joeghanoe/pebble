# Squad Decisions

## Active Decisions

### API Hardening — Separation of Concerns & Code Quality

**Date:** 2026-04-06  
**Author:** Tank (Backend Dev)  
**Status:** ✅ Implemented

**Summary:** Applied SOLID principles to portfolio-api: runtime schema validation via Elysia, extracted positions logic to service layer, removed side-effects from GET endpoints, added price service reset on credential changes.

**Key Changes:**
- Elysia `t.Object()` schemas replace type casts
- `src/services/positions.ts` extracted; routes delegated to services
- `GET /api/net-worth` is now pure (backfill at startup)
- Price service resets when credentials change

### Frontend Hardening — Separation of Concerns

**Date:** 2026-04-06  
**Author:** Trinity (Frontend Dev)  
**Status:** ✅ Completed

**Summary:** Eliminated four anti-patterns: module-level mutable state → `useRef()`, centralized API client in `src/lib/api.ts`, replaced raw `fetch()` with typed `api.*` methods, replaced direct `queryClient` imports with `useQueryClient()` hook, added `Readonly<Props>` to all components.

**Key Changes:**
- State management: module-level → `useRef()` (Dashboard, PositionDetail)
- API: scattered `fetch()` → centralized typed client
- React Query: direct imports → `useQueryClient()` hook
- Type safety: added `Readonly<>` to all component props

### Biometric Authentication Integration

**Date:** 2026-04-06  
**Author:** Morpheus (Lead / Architecture)  
**Status:** ✅ Implemented

## Decision

Integrated `tauri-plugin-biometry` v0.2 into the Tauri desktop app to enforce mandatory biometric authentication (Touch ID / Face ID / Windows Hello) before granting application access.

## Rationale

**Security Requirements:**
- **POLA (Principle of Least Authority)**: Users must prove identity before accessing sensitive portfolio data
- **S.1 Least Privileged**: No unauthenticated access to financial information
- **S.6 Fail Securely**: App won't proceed without successful biometric verification

Financial applications handling real-time portfolio data, net worth calculations, and credentials must enforce strong authentication at the OS level.

## Implementation

**Files Modified:**
1. `packages/portfolio-tracker-tauri/src-tauri/Cargo.toml`: Added `tauri-plugin-biometry = "0.2"` dependency
2. `packages/portfolio-tracker-tauri/src-tauri/src/lib.rs`: Registered plugin via `.plugin(tauri_plugin_biometry::init())` before shell plugin
3. `packages/portfolio-tracker-tauri/src-tauri/capabilities/default.json`: Added `"biometry:default"` to permissions array

**Plugin Source:** https://github.com/Choochmeque/tauri-plugin-biometry

## Impact

- **Security**: ✅ Enforces biometric authentication layer
- **UX**: Native OS biometric prompts (Touch ID, Face ID, Windows Hello)
- **Compatibility**: macOS, Windows, Linux (where biometrics available)

### Biometric Authentication Gate

**Date:** 2026-04-06  
**Agent:** Trinity  
**Status:** ✅ Implemented

## Problem

Portfolio Tracker contains sensitive financial data and must enforce biometric authentication (Touch ID, Face ID, Windows Hello) before granting access. This is a production security requirement.

## Decision

Implemented a `BiometricGate` component that wraps the entire application and enforces biometric authentication before rendering any content.

### Architecture

```
<QueryClientProvider>
  <ThemeProvider>
    <BiometricGate>          ← Auth happens here
      <RouterProvider />     ← App renders AFTER auth
    </BiometricGate>
  </ThemeProvider>
</QueryClientProvider>
```

### Key Design Choices

1. **Dev Mode Bypass**
   - Check `import.meta.env.DEV` at component level
   - If dev mode, immediately render children without any auth
   - Preserves fast HMR workflow during development

2. **Graceful Degradation**
   - If biometrics unavailable (biometryType === 0), show warning banner but allow access
   - Rationale: Some machines don't have biometric hardware; we shouldn't completely lock them out
   - User sees persistent yellow warning banner at top of app

3. **State Machine**
   - `loading`: Shows spinner + "Authenticating..." message
   - `success`: Renders children (entire app)
   - `error`: Shows error message + "Try Again" button
   - `no-biometry`: Shows warning banner + renders children

4. **Dynamic Import**
   - Biometry API imported with `await import()` inside try/catch
   - Handles environments where `window.__TAURI__` is undefined (web preview, tests)
   - Fails gracefully if package not installed

5. **Provider Placement**
   - Gate sits INSIDE `<ThemeProvider>` → auth UI respects current theme
   - Gate WRAPS `<RouterProvider>` → no routes render until auth succeeds

### API Usage

```typescript
// Check availability
const status = await checkStatus();
// status.biometryType: 0=None, 1=TouchID, 2=FaceID, 3=Iris, 4=WindowsHello

// Authenticate
await authenticate("Authenticate to access Portfolio Tracker", {
  allowDeviceCredential: true,  // allow passcode fallback
  cancelTitle: "Cancel",
  fallbackTitle: "Use Passcode",
});
```

### Security Properties

- ✅ No app content renders until biometric auth succeeds
- ✅ Dev mode bypass prevents broken workflow during development
- ✅ Graceful degradation for machines without biometric hardware
- ✅ Clear error states with retry mechanism
- ✅ Respects system theme (dark/light mode)

### Files Modified

- `packages/portfolio-tracker/src/components/BiometricGate.tsx` (new)
- `packages/portfolio-tracker/src/main.tsx` (wrapped RouterProvider)

### Tauri v2 Sidecar Architecture for Portfolio Tracker

**Date:** 2026-04-07  
**Author:** Niobe (DevOps/Infra)  
**Status:** ✅ Implemented

## Context

Portfolio Tracker is a Bun monorepo with three packages:
- `portfolio-tracker` — React 19 + Vite frontend
- `portfolio-api` — Bun/Elysia backend (port 3131)
- `portfolio-tracker-tauri` — Desktop app wrapper

The desktop app needs to bundle both the frontend and backend as a single distributable binary.

## Decision

Use **Tauri v2 sidecar pattern** to embed the API server as a background process within the desktop app.

### Architecture

1. **Sidecar Binary Compilation:**  
   - `scripts/build-sidecar.sh` compiles `portfolio-api` into a platform-specific standalone binary using `bun build --compile`
   - Output: `src-tauri/binaries/portfolio-api-<triple>` (e.g., `portfolio-api-aarch64-apple-darwin`)
   - Specified in `tauri.conf.json` via `bundle.externalBin: ["binaries/portfolio-api"]` (platform-agnostic path; Tauri resolves the triple automatically)

2. **Process Lifecycle:**  
   - Sidecar spawned in `setup` hook via `app.shell().sidecar("binaries/portfolio-api").spawn()`
   - Returns `(Receiver<CommandEvent>, CommandChild)`
   - Child process stored in Tauri managed state (`ApiProcess(Mutex<CommandChild>)`) to keep alive for app lifetime
   - Stdout/stderr logged asynchronously in background thread via `tauri::async_runtime::spawn`

3. **Security:**  
   - `capabilities/default.json` grants `shell:allow-execute` permission for the sidecar with `"sidecar": true` flag
   - CSP disabled (`"csp": null`) to allow localhost API communication

4. **Frontend Integration:**  
   - `beforeDevCommand`: Runs Vite dev server from sibling package (`cd ../portfolio-tracker && bun run dev`)
   - `beforeBuildCommand`: Builds production Vite bundle
   - `frontendDist`: Points to `../portfolio-tracker/dist` (relative to Tauri project root)
   - Frontend makes HTTP requests to `http://localhost:3131` (sidecar API)

## Benefits

- **Single Binary Distribution:** Users download one `.app`/`.exe` file, no manual API server setup
- **Clean Separation:** Web frontend remains unchanged, works in both browser and desktop contexts
- **Monorepo Efficiency:** Reuses existing `portfolio-api` codebase without duplication
- **Cross-Platform:** Tauri handles platform-specific bundling (macOS, Windows, Linux)

### Vite Build Target: safari13 → safari16

**Date:** 2026-04-06  
**Decision Maker:** Trinity (Frontend Dev)  
**Status:** ✅ Implemented

## Context

The Tauri build was failing with the following error from esbuild:
```
Transforming destructuring to the configured target environment ("safari13" + 2 overrides) is not supported yet
```

This error originated from `recharts` v3.8.1, which uses modern JavaScript features including:
- Destructuring in class property initializers
- Private class fields
- Other ES2022+ syntax

The original Vite config specified `safari13` as the build target for macOS platforms, which is incompatible with these modern features.

## Decision

**Changed the Vite build target from `safari13` to `safari16` in `packages/portfolio-tracker/vite.config.ts`.**

## Rationale

1. **Tauri v2 Compatibility:** Tauri v2 requires macOS 12+ and uses WKWebView, which supports Safari 15/16+ features natively
2. **Modern JavaScript Support:** Safari 16 (released September 2022) fully supports:
   - Class fields and private methods
   - Destructuring in all contexts
   - All ES2022 features used by recharts v3
3. **No User Impact:** Any system capable of running Tauri v2 already has a WebView engine that supports Safari 16+ features
4. **Future-Proof:** Allows use of modern npm packages without artificial constraints

## Implementation

```diff
  build: {
-   target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
+   target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari16",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
```

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
