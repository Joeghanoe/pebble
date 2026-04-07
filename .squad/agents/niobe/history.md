# Project Context

- **Owner:** Redacted
- **Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, shadcn/ui, Bun | C# 13, .NET 10, Azure Functions (Isolated Worker), Durable Functions, Cosmos DB, Blob/Table Storage, Application Insights | Bicep, Azure Entra ID, Key Vault, Managed Identity
- **Created:** 2026-03-29

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Tauri v2 Desktop App Setup (2026-04-07)

- **Sidecar Binary Architecture:** Tauri v2 sidecar binaries are specified via `bundle.externalBin` with platform-agnostic paths (e.g., `"binaries/portfolio-api"`). Tauri automatically appends the platform triple at bundle time. The `build-sidecar.sh` script compiles `portfolio-api` using `bun build --compile` into `binaries/portfolio-api-<triple>`.

- **Security Model:** Capabilities system requires explicit permission grant. `capabilities/default.json` grants `shell:allow-execute` for the sidecar with `"sidecar": true` flag. CSP set to `null` for localhost API communication during development.

- **Process Management:** Sidecar spawned in `setup` hook via `app.shell().sidecar()`. Returns `(Receiver<CommandEvent>, CommandChild)`. Child process stored in managed state (`Arc<Mutex<CommandChild>>`) to keep alive for app lifetime. Stdout/stderr logged asynchronously via `tauri::async_runtime::spawn`.

- **Monorepo Integration:** `beforeDevCommand` runs Vite dev server from sibling package (`cd ../portfolio-tracker && bun run dev`). `frontendDist` points to `../portfolio-tracker/dist` (relative to Tauri project root). Maintains clean separation between web frontend and desktop wrapper.
