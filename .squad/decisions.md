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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
