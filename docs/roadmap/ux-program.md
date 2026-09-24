# UX-First Trading Terminal Program

Status: CURRENT
Owner: product / UI-UX
Date established: 2026-09-23
Source: UI/UX Product Audit
Decision: ADR-0002 plus ADR-0003 for the financial/order reset

## Purpose

Reframe EVE Trade around the user's actual trading workflow before unrelated technical work starts.

## Hard sequencing rule

No dependent feature chantier starts before its domain contract is stable.

Documentation and contract work may proceed. Narrow CI/security regressions may proceed independently. Financial, performance and portfolio implementation is held by the ADR-0003 reset.

## Workstream order

### UX-00 — Product model and information architecture
Status: DONE

### UX-01 — Market truth / retrieval observability
Status: DONE / EXTERNALLY BOUNDED

### UX-02 — Operations / Mes Ordres
Status: DONE / MERGED

### FIN-001 — Acquisition lots / Current Position
Status: P0 / BLOCKING
Reference: issue #72

### ORD-001 — Canonical MarketOrder axes
Status: P0 / BLOCKING
Reference: issue #73

### FIN-002 — Position lifecycle / Performance
Status: P0 / BLOCKING
Reference: issue #74

### DATA-001 — Provenance and zero-fallback audit
Status: P0 / BLOCKING
Reference: issue #75

### UX-03 — Allocation / Portefeuille
Status: IMPLEMENTED SCAFFOLD / CERTIFICATION BLOCKED

UX-03 resumes after the P0 financial/order contract gate. Its Real Portfolio side must consume the accepted position/cost-basis model.

### UX-04 — Performance / Journal
Status: P1 / BLOCKED

UX-04 consumes FIN-001/FIN-002 instead of defining its own accounting lifecycle.

### UX-05 — Control Center / Paramètres
Status: P1

### UX-06 — Cockpit
Status: P2

### UX-07 — Interaction, responsive and accessibility hardening
Status: P2

## Shared contracts

Every surface must define:
- primary user goal;
- primary decision;
- primary authoritative sources;
- source/provenance;
- data health;
- freshness and coverage;
- loading/empty/stale/partial/error behavior;
- action semantics;
- validation scenarios.

## Anti-drift rules

- market order side != economic transaction direction;
- order observation != acquisition fact;
- partial realization != closed position;
- projected values != realized values;
- character/corporation scope != separate order entity;
- UNKNOWN/PARTIAL/ERROR/ABSENT != zero;
- order ID is never invented on financial transactions;
- UI must not hide an incomplete position basis.

## Exit criteria

The current reset is closed only when ADR-0003 is accepted, FIN-001/ORD-001/FIN-002/DATA-001 pass their scenarios, CI is green and roadmap/current-state/known-gaps are synchronized.
