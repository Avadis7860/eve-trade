# Master Plan

Status: CURRENT
Scope: strategic sequencing
Source of truth: current code/tests/CI and state documents
Implementation: tracked roadmaps and code
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The market/ESI retrieval foundations and UX-02 Operations work are certified. UX-03 exposed a deeper domain-model mismatch that must now be resolved before further product implementation.

The key separation is:

Market Order Observation -> exposure/provenance

Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome

The active UX-03 branch is frozen while this contract is re-based.

## Mandatory sequencing gate

No dependent financial, performance or portfolio feature starts until the contract reset is accepted.

Allowed in parallel:
- narrow CI maintenance;
- security/regression fixes;
- documentation and contract work required by this reset.

## Ordered roadmap

| ID | Status | Goal | Dependencies | Risk | Validation |
|---|---|---|---|---|---|
| DOC-001 | DONE | Modular documentation governance | repository baseline | stale truth | docs/link audit |
| E2E-001 | DONE | Reproducible OAuth/browser gate | auth/ESI | environment integration | browser + API smoke |
| UX-00 | DONE | Product model and information architecture | audit | scope drift | accepted UX contract |
| UX-01 | DONE / EXTERNALLY BOUNDED | Market/ESI truth and retrieval observability | UX-00 | hidden error/empty states | caller + ERROR/PARTIAL/STALE/429 proof |
| UX-02 | DONE / MERGED | Operations / Mes Ordres | UX-00/01 | business state fragmentation | UI/browser acceptance |
| FIN-001 | P0 / BLOCKING | Acquisition lots and current position ledger | ESI transaction facts + ADR-0003 | wrong cost basis / incomplete inventory | lot/position scenarios |
| ORD-001 | P0 / BLOCKING | Canonical MarketOrder axes: ID, side, issuer, owner, observer | existing ownership/order identity | provenance confusion | order scenarios |
| FIN-002 | P0 / BLOCKING | Position lifecycle and Performance semantics | FIN-001 | partial sale misreported as closed | lifecycle/P&L scenarios |
| DATA-001 | P0 / BLOCKING | Audit provenance and numeric fallback semantics | FIN-001/ORD-001 | false zero / false completeness | source/state audit |
| UX-03 | P1 / PAUSED | Real Portfolio + Proposed Allocation | FIN-001/ORD-001 + UX-00..02 | misleading allocation/cost basis | engine + UI + scenario tests |
| UX-04 | P1 / BLOCKED | Automatic Performance & Historique | FIN-001/FIN-002 | incorrect attribution | accounting + reconciliation |
| UX-05 | P1 | Control Center / Paramètres | UX-03/04 | fake/non-operative controls | consumer matrix |
| UX-06 | P2 | Cockpit synthesis | UX-02..05 | duplicated semantics | browser workflow |
| UX-07 | P2 | Interaction/accessibility hardening | UX-02..06 | broad UI regression | browser + a11y |

## Immediate maintenance

CI-003 / #76 may be fixed independently because it does not change the product model. CI-002 remains the separate Draft-routing follow-up.

## Current branch governance

PR #71 / `ux-03/allocation-contract` remains open for traceability but is frozen and must not be merged in its current semantic state.

See [Financial Truth Rebase](financial-truth-rebase.md), [ADR-0003](../decisions/ADR-0003-economic-position-and-order-model.md), [Current Chunk](current-chunk.md), [Backlog](backlog.md) and [Known Gaps](../state/known-gaps.md).

## Definition of Done

Every major chantier leaves the roadmap, current-state, known-gaps and relevant domain/architecture documentation synchronized with implementation and validation evidence. Contract changes precede dependent code changes.
