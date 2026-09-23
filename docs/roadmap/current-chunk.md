# Current Chunk

Status: ACTIVE
Scope: UX-02 — Operations / Mes Ordres
Reference: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Program: [UX-First Trading Terminal Program](ux-program.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)

## Objective

Turn Mes Ordres into the Operations console for active market positions while preserving canonical ownership and explicit market-data truth.

## Current increment

- Operational KPI strip: liquidity, escrow, active orders, immobilized exposure, actions required, ageing risk.
- Order rows expose ownership, side, item, location, price, fill ratio, remaining duration, exposure, market distance, health and recommendation.
- Order detail exposes last market observation, recommendation rationale, projected remaining outcome and ownership provenance.
- Active-order sync failures are explicit and never rendered as an ordinary empty state.
- Order timing/market-distance derivations are covered by focused tests.
- Performance analytics has been removed from the Operations component and remains owned by the Performance surface.


## Scope discipline

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 remain deferred.

UX-01 technical implementation is merged and provides the shared market-data truth primitives, but the target-PC market-order incident remains NOT ROOT-CAUSED until the required PC evidence is captured.


## Validation

Current increment gate: PASS. Deterministic browser CI now proves the keep / adjust / relocate / cancel decision loop together with explicit loading/data-health semantics already covered by the Operations suite.

UX-02 remains ACTIVE for the broader product scope; the target-PC incident is a separate UX-01 validation matter and remains NOT ROOT-CAUSED.

