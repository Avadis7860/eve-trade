# Backlog

Status: CURRENT
Scope: open work only
Source of truth: revalidated code, tests, CI and current state documents

## P0 — Financial Truth / Position Model — IMPLEMENTATION IN PROGRESS

These items block further finance, performance and portfolio development until their contracts are accepted.

- **FIN-001 / #72:** derive economic acquisitions from real transactions; create first-class Acquisition Lots with source/provenance, remaining quantity and cost basis; derive Current Position from open lots.
- **ORD-001 / #73:** keep one canonical MarketOrder model; character/corporation remain ownership/scope dimensions; issuer and observer remain explicit provenance.
- **FIN-002 / #74:** rebuild Performance around OPEN -> PARTIALLY_REALIZED -> CLOSED. A partial sale realizes P&L on the allocated quantity but does not close the underlying position.
- **DATA-001 / #75:** audit every financial path for UNKNOWN/PARTIAL/ERROR/ABSENT -> 0 collapse and provenance loss.
- Active BUY orders may reserve capital but are not acquisition facts.
- Market order side must never be treated as economic acquisition/disposition direction.

## P0 — CI regression harness

**CI-003 / #76** is a narrow maintenance fix for the current red Unit/Domain Certification lane on the UX-03 branch. It must repair the test harness only and preserve the exact real-corporation-payload regression.

## P0 — Market / ESI truth and retrieval reliability — DONE / CLOSED

Completed:
- Observable public market-order error propagation.
- HTTP, cache and ESI budget metadata surfaced to the browser UI.
- Stale-cache preservation on previously observed market data.
- Deterministic ERROR / PARTIAL / STALE coverage.
- Global sync failure accounting for market-quality ERROR.
- P0-A caller audit.
- P0-B 429 / Retry-After certification.
- P0-C evidence export and target-PC evidence.

There is no active P0 market reliability branch.

## UX-02 — Operations / Mes Ordres — DONE / MERGED

The Operations console and its browser decision loop are merged and certified.

## P1 — Allocation / Portefeuille

Status: IMPLEMENTED SCAFFOLD / CERTIFICATION BLOCKED

The UX-03 implementation is retained as scaffolding but must be re-based on FIN-001/ORD-001/FIN-002/DATA-001 before final certification.

The Real Portfolio cost basis must come from the position/lot contract, not active BUY orders.

## P1 — Performance / Journal — BLOCKED BY FIN-001/FIN-002

- Replace manual financial truth with ESI-derived trade reconstruction.
- Reconcile transactions, acquisition lots, disposal allocations, fees and realized outcomes.
- Compare predicted vs observed profit, ROI and turnover only after the position ledger is authoritative.
- Keep manual input only for optional personal notes.

## P1 — Control Center / Paramètres

- Surface effective decision parameters and their actual engine consumers.
- Separate business policy from technical maintenance.
- Label non-operative controls explicitly.

## P2 — Cockpit

Rebuild cockpit around decision-oriented synthesis after UX-02..UX-05 contracts are stable.

## P2 — UX hardening

Responsive behavior, accessibility, interaction density and consistent degraded-data states.

## Deferred technical work

- PST-001: IndexedDB decomposition.
- UI-001: corporation trading scope UI.
- E2E-002: broader critical browser workflows.
- UI-002: large frontend component decomposition.
- PERF-001: performance measurement/optimization.
- TYPE-001: legacy typing/facade cleanup.
- CI-002: Draft/Ready PR routing hardening.

## Governance rule

No feature work may bypass the current contract-rebase gate. Historical issues are not copied into active work unless there is fresh evidence.

