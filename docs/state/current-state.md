# Current State

Status: CURRENT
Scope: current main + active working branch
Source of truth: code, tests, CI and manifests

## Current main baseline

Current main head remains aec4c62691723e8fa2ee2bb2f9126249152ad57f after PR #70. The UX-03 branch has not been merged and must not be treated as current main product truth.

The market/ESI retrieval reliability gate is closed and UX-02 Operations is merged/certified.

## Active working branch reality

The only active product branch is ux-03/allocation-contract, associated with PR #71. It remains FROZEN FOR UX-03 FEATURE DEVELOPMENT pending certification of FIN-001 / ORD-001 / FIN-002 / DATA-001; the financial/order contract rebase and CI repair are now implemented and green.

The branch currently expresses the following boundaries:

- market is_buy_order is a market-mechanism fact, not an economic acquisition/disposition fact;
- economic direction for accounting comes from transaction facts;
- active BUY orders are capital reservations/order exposure, not acquisition evidence;
- deterministic AcquisitionLot / CurrentPosition reconstruction now exists in src/engine/positionLedger.ts;
- the ledger is a calculation boundary, not a durable IndexedDB position source;
- a partial disposal can create a positive sale allocation while the underlying position remains PARTIALLY_REALIZED;
- Performance closed-trade KPIs now require a fully closed position;
- order-history activity is separated from accounting buy/sell volume;
- position-level capital recovery is a dedicated derived axis and is projected through CurrentPosition / RealizedFinancialOutcome into Performance metrics; realized P&L and ROI remain separate.

Priority issues:
- FIN-001 #72
- ORD-001 #73
- FIN-002 #74
- DATA-001 #75
- CI-003 #76

## Stable foundations

- canonical catalog and CCP SDE-backed universe;
- shared backend ESI transport with principal-aware gateway behavior;
- explicit collection quality states;
- canonical string OrderId;
- economic ownership separated from observing principal;
- certified market/ESI failure semantics;
- UX-02 Operations.

These foundations are not being discarded.

## Product reality

The current engine/domain layers remain ahead of the UI, but the financial boundary needs rework before the next UX certification.

- Global discovery remains the discovery surface.
- Operations remains the operational order surface.
- UX-03 allocation scaffolding exists, but Real Portfolio certification is blocked by the position/lot contract.
- Journal remains manual.
- Character Assets are not implemented; therefore current inventory coverage cannot be assumed complete.
- Performance analytics now has both a position-lifecycle boundary and a dedicated capital-recovery projection, but certification still depends on the remaining FIN-001 / ORD-001 / DATA-001 gates.
- A complete whole-operation result is not inferred from a single matched disposal.

## Active gaps

- Capital recovery is now a dedicated output across the canonical Performance character and fleet projections, with explicit KNOWN_POSITIONS scope.
- Unrealized/current-market valuation is still a separate future/market-derived surface.
- No durable AcquisitionLot / CurrentPosition store exists.
- Provenance needs an audit across aggregation paths.
- Some numeric defensive fallbacks still convert invalid/missing values to zero inside financial calculations and must be audited under DATA-001.
- CI is currently RED on the latest branch head verification.

## Latest CI verification

Validated code head: 4d4694955a1e75532455a8d924922bdc23999d8e

CI Foundation & Regression Gate: GREEN
Phase 2.7C SDE Truth Gate: GREEN

The full gate passed including:
- CI / Change Scope;
- Static / Config / Auth;
- Server / API / Security / ESI;
- Unit / Domain Certification;
- Production Build;
- Browser E2E — Operations;
- Browser E2E — Auth;
- Browser E2E — OAuth/ESI composition;
- Validation & Non-Regression Gate;
- required-gate and observability completion.

The earlier RED state was resolved through test/fixture reconciliation only; no financial or positive-ID invariant was weakened.

## Sequencing

Documentation rebase comes before code correction. The next code changes must first repair the two known CI regressions, then continue FIN-002 capital-recovery semantics and DATA-001 under the frozen contract.

UX-03 resumes only after FIN-001/ORD-001/FIN-002/DATA-001 and the CI gate are accepted.
