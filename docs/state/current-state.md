# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

The functional E2E-001 baseline is 9438bbedb2d44cf3f5f371144bcf72094955cd46. Deterministic browser CI is green and the target-PC real-CCP SSO/ESI smoke PASS was recorded on 2026-09-23.

The current documentation update establishes the UX-first product program as the next sequencing authority.

## Stable foundations

- Canonical catalog protected by version/count/checksum manifest.
- Canonical CCP SDE-backed universe graph protected by manifest, provenance, checksum and cardinality.
- Shared backend ESI transport with principal-aware gateway behavior, ETag/304 and rate-limit metadata.
- Corporation ESI authorized through the authenticated character; no synthetic corporation credential.
- Canonical string OrderId, with unsafe numeric values rejected.
- Explicit economic ownership separated from observing principal.
- Explicit ESI collection states.
- RealizedFinancialOutcomeEngine is the accounting source of truth.
- IndexedDB version 5 with 11 object stores.
- Market outcome scheduler is started by App.tsx and stopped on unmount.
- Modular documentation architecture is the active governance model.

## Product reality

The current engine/domain layers are ahead of the UI information architecture.

- Global discovery is useful and remains the principal discovery surface.
- Mes Ordres is overloaded and currently combines operational orders, market sync, advisor, analytics and authentication concerns.
- Portfolio allocation supports concentration by item type/group, but the current React opportunity input is derived from the selected item, so the UI cannot express the intended cross-item diversified allocation.
- Journal remains manual despite ESI-derived transactions, order history and wallet journal already being available.
- Parameter UI contains real controls, but business-critical decision thresholds are not surfaced with the same priority and some exposed flags do not have a demonstrated current consumer.
- UI must become explicit about data health: LIVE, CACHE, STALE, PARTIAL, UNKNOWN, ERROR.

## Active product gaps

- Target-PC public market-order retrieval failure is reported but not root-caused.
- Market acquisition failures can be collapsed into apparent empty business state by silent error handling.
- No coherent Operations surface exists yet.
- No coherent Real Portfolio vs Proposed Allocation split exists yet.
- No automatic ESI-derived performance history replaces the manual journal yet.
- No clear business Control Center exists yet.
- Cockpit remains too item-centric to serve as a decision-oriented synthesis.

## Current chantier / sequencing

UX-00 is the next work item and is BLOCKING.

UX-01 is the only implementation chantier explicitly permitted before the UX baseline is accepted because it establishes data truth for the current operational incident.

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 are DEFERRED until the UX sequencing gate is passed.

## Reference paths

[UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md) ·
[UX Program](../roadmap/ux-program.md) ·
[Master Plan](../roadmap/master-plan.md) ·
[Truth Matrix](truth-matrix.md) ·
[Known Gaps](known-gaps.md) ·
[Frontend](../architecture/frontend.md) ·
[Trading Orders](../domains/trading/orders.md) ·
[Financial Truth](../domains/finance/financial-truth.md)
