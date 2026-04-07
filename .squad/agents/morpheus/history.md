# Project Context

- **Owner:** Redacted
- **Stack:** React 19, TypeScript,  Zustand, Tailwind CSS v4, shadcn/ui, Bun | C# 13, .NET 10, Azure Functions (Isolated Worker), Durable Functions, Cosmos DB, Blob/Table Storage, Application Insights | Bicep, Azure Entra ID, Key Vault, Managed Identity
- **Created:** 2026-03-29

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Tauri Plugin Integration Pattern (2026-04-06)

**tauri-plugin-biometry v0.2** integrated for mandatory biometric authentication (Touch ID / Face ID / Windows Hello):

1. **Cargo.toml**: Add plugin to `[dependencies]`
2. **lib.rs**: Register plugin with `.plugin(tauri_plugin_biometry::init())` in builder chain (order matters — register before shell plugin)
3. **capabilities/default.json**: Add `"biometry:default"` to permissions array

**Security rationale**: All users must authenticate via biometrics before app access (enforces POLA, S.1 Least Privileged, S.6 Fail Securely). Plugin from https://github.com/Choochmeque/tauri-plugin-biometry