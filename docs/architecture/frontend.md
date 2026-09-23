# Frontend Architecture

Status: PARTIAL
Scope: React/Vite presentation and orchestration
Source of truth: src/App.tsx, src/components/, src/hooks/, src/services/
Implementation: src/App.tsx and component/hook tree
Tests: TypeScript/build plus targeted service/engine tests
CI gate: frontend typecheck + unit suite + build

## Structure

- App.tsx composes application state and views.
- components/ contains UI views/modals/cards.
- hooks/ exposes synchronization and derived application flows.
- services/ provides backend/ESI/persistence/analytics orchestration.
- types/ is the modular public type boundary.

## Product-facing architecture

The presentation layer is now governed by the UX-first program:

MARKET / ESI
  ->
DATA TRUTH / HEALTH
  ->
DISCOVERY / OPERATIONS / PERFORMANCE
  ->
ALLOCATION
  ->
COCKPIT

Parameters are the control plane.

The current target surfaces are:
- Discovery: market opportunity radar.
- Operations: active-order decision console.
- Allocation: real exposure plus proposed diversified capital allocation.
- Performance: automatic observed-vs-predicted trading history.
- Control Center: business decision parameters and technical diagnostics separated.
- Cockpit: application-wide decision synthesis.

## Important boundaries

BackendApiClient is the frontend HTTP transport. EsiService adds EVE-specific response semantics, normalization and service-level orchestration.

Character and corporation order aggregation must preserve canonical ownership and observer provenance.

Market data health is a product concern, not just a transport concern. UI state must preserve the distinction between LIVE, CACHE, STALE, PARTIAL, UNKNOWN and ERROR.

## Current gaps

Several UI files are large; broader decomposition is deliberately deferred until the relevant UX contracts are accepted.

Some data acquisition errors are still swallowed by callers and can become visually ambiguous empty states. UX-01 must close this before broader UI work.

The full UX sequencing and surface contracts live in:
- [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
- [UX program](../roadmap/ux-program.md)
- [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)

[See trading order domain](../domains/trading/orders.md).
