# Backlog

Status: CURRENT
Scope: open work only
Source of truth: revalidated code, tests, CI and current state documents

## P0 — Financial Truth / Position Model — FIN-001 CLOSED / FIN-002 NEXT

These items block further finance, performance and portfolio development until their contracts are accepted.

- **FIN-001 / #72 — CERTIFIED:** economic acquisitions are derived from real transactions; Acquisition Lots and Current Position carry source/provenance, remaining quantity, cost basis and lifecycle.
- **ORD-001 / #73 — CERTIFIED:** one canonical MarketOrder model; character/corporation remain ownership/scope dimensions; issuer and observer remain explicit provenance.
- **FIN-002 / #74 — IN PROGRESS:** harden Performance around OPEN -> PARTIALLY_REALIZED -> CLOSED. Disposal results remain visible at disposal scope; closed-position win rate/ROI and profitability rankings use the cumulative whole-position result only at closure.
- **DATA-001 / #75 — FIRST AUDIT CERTIFIED:** audit every financial path for UNKNOWN/PARTIAL/ERROR/ABSENT -> 0 collapse and provenance loss.
- Active BUY orders may reserve capital but are not acquisition facts.
- Market order side must never be treated as economic acquisition/disposition direction.

## P0 — CI regression harness

**CI-003 / #76 — RESOLVED.** The CI harness regression was corrected without weakening the corporation payload contract.

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

Status: IMPLEMENTED SCAFFOLD / FINANCIAL REBASE PARTIALLY CERTIFIED

Manual E2E follow-up is now recorded: the final UX pass must separate decision-critical allocation information from diagnostic evidence and group repeated DATA_ISSUE explanations without suppressing the underlying state.

The UX-03 implementation is retained as scaffolding. FIN-001/ORD-001 are certified; FIN-002 remains the next financial gate before final Portfolio/Performance certification.

The Real Portfolio cost basis must come from the position/lot contract, not active BUY orders.

## P1 — Performance / Journal — NEXT AFTER FIN-001

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

### UX-02 follow-up — operational order workflow

Manual E2E identified two concrete usability requirements:

- **Corporation order operational visibility:** corporation-owned orders must remain corporation-owned while being available in a character's operational hub workflow when the character legitimately observes or issued them. This must not rewrite economic ownership.
- **Configurable order columns:** Mes Ordres needs user-controlled show/hide columns, a compact default view, reset-to-default and local persistence. Hidden columns remain part of the underlying data contract.

These are UI projection changes, not financial/accounting changes.

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

