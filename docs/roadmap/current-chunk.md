# Current Chunk

Status: ACTIVE / BLOCKING
Scope: UX-00 — Product model and information architecture
Reference: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Program: [UX-First Trading Terminal Program](ux-program.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)

## Objective

Define and freeze the trading-terminal information architecture, screen responsibilities, shared vocabulary and cross-screen transitions before implementation of the major UI workstreams.

## Required output

- Discovery responsibility defined and protected.
- Operations / Mes Ordres contract.
- Allocation / Portefeuille contract.
- Performance / Journal contract.
- Control Center / Paramètres contract.
- Cockpit contract.
- Shared data-truth vocabulary: LIVE, CACHE, STALE, PARTIAL, UNKNOWN, ERROR.
- Shared loading/empty/error/stale/partial behavior.
- Surface-to-surface transition map.
- Acceptance scenarios for the next implementation workstreams.

## Blocking rule

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 remain deferred while UX-00 is active.

UX-01 is the only implementation workstream allowed to proceed before UX-00 is fully accepted, and only for market/ESI reliability and observability required by the current target-PC market-order incident.

## Validation

The chunk is complete only when the UX baseline is documented, internally consistent, linked from the master plan and backlog, and implementation-ready acceptance criteria exist for UX-01 through UX-05.
