# Frontend Architecture

Status: PARTIAL
Scope: React/Vite presentation and orchestration
Source of truth: `src/App.tsx`, `src/components/`, `src/hooks/`, `src/services/`
Implementation: `src/App.tsx` and component/hook tree
Tests: TypeScript/build plus targeted service/engine tests
CI gate: frontend typecheck + unit suite + build

## Structure

- `App.tsx` composes application state and views.
- `components/` contains UI views/modals/cards.
- `hooks/` exposes synchronization and derived application flows.
- `services/` provides backend/ESI/persistence/analytics orchestration.
- `types/` is the modular public type boundary.

## Important boundaries

`BackendApiClient` is the frontend HTTP transport. `EsiService` adds EVE-specific response semantics, normalization and service-level orchestration.

Character and corporation order aggregation must preserve canonical ownership and observer provenance.

## Current gaps

Several UI files are large; browser E2E is not yet a reference validation surface. UI refactoring is future work and must not reopen stable domain contracts without need.

[See trading order domain](../domains/trading/orders.md).
