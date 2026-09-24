# Current State

Status: CURRENT
Scope: current main + active working branch
Source of truth: code, tests, CI and manifests

## Current main baseline

Current main head remains aec4c62691723e8fa2ee2bb2f9126249152ad57f after PR #70. The UX-03 branch has not been merged and must not be treated as current main product truth.

The market/ESI retrieval reliability gate is closed and UX-02 Operations is merged/certified.

## Active working branch reality

The only active product branch is ux-03/allocation-contract, associated with PR #71. It remains FROZEN FOR UX-03 FEATURE DEVELOPMENT pending completion of FIN-002 and the remaining data-quality/UX acceptance gates; FIN-001, ORD-001 and the first DATA-001 audit are certified and the financial/order contract rebase plus CI repair are green.

The branch currently expresses the following boundaries:

- market is_buy_order is a market-mechanism fact, not an economic acquisition/disposition fact;
- economic direction for accounting comes from transaction facts;
- active BUY orders are capital reservations/order exposure, not acquisition evidence;
- deterministic AcquisitionLot / CurrentPosition reconstruction now exists in src/engine/positionLedger.ts, but its current character-keyed accounting boundary is under FIN-002 rework;
- the target ledger boundary is the complete configured trading/industrial ecosystem, while character/corporation identity remains transaction attribution/provenance;
- the ledger is a calculation boundary, not a durable IndexedDB position source;
- a partial disposal can create a positive sale allocation while the underlying position remains PARTIALLY_REALIZED;
- Performance closed-trade KPIs now require a fully closed position;
- order-history activity is separated from accounting buy/sell volume;
- position-level capital recovery is a dedicated derived axis and is projected through CurrentPosition / RealizedFinancialOutcome into Performance metrics; realized P&L and ROI remain separate.

Priority sequence:
- FIN-001 #72 — CERTIFIED
- ORD-001 #73 — CERTIFIED
- FIN-002 #74 — ACTIVE SEMANTIC REBASE
- DATA-001 #75 — CERTIFIED (first audit)
- CI-003 #76 — RESOLVED / HISTORICAL

ORD-001 #73 is certified and no longer an active implementation blocker.

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
- Performance analytics now has both a position-lifecycle boundary and a dedicated capital-recovery projection; broader certification remains gated by FIN-002 and the remaining UX/data-quality acceptance work.
- A complete whole-operation result is not inferred from a single matched disposal.

## Active gaps

- Capital recovery is now a dedicated output across the canonical Performance character and fleet projections, with explicit KNOWN_POSITIONS scope.
- Unrealized/current-market valuation is still a separate future/market-derived surface.
- No durable AcquisitionLot / CurrentPosition store exists.
- DATA-001 first pass now preserves unavailable ratios, removes invalid economic-volume coercion, and carries financial provenance through position, trader and fleet projections.
- Remaining numeric `0` fallbacks are being classified as legitimate accumulators/scope sentinels or separate prospective-domain policies; the financial truth boundary no longer fabricates missing physical volume or ROI.
- CI is GREEN on the latest branch head verification.

## Latest CI verification

Validated code head: 59d4780db405af8864b5bf1e0f57ebe4d1d4ab2f

CI Foundation & Regression Gate #923: GREEN
Phase 2.7C SDE Truth Gate #684: GREEN

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

ORD-001 and FIN-001 certification completed after resolving the stale type/provenance regressions exposed by CI #892/#919; no financial or positive-ID invariant was weakened.

## Sequencing

Documentation is now aligned with the ecosystem-level accounting correction. The next code changes target FIN-002; remaining UX-03 feature work stays blocked until the financial sequence is accepted.

The current branch must not be treated as product truth for cross-character/corporation financial matching: CI green confirms regression integrity, not semantic certification.

UX-03 feature work resumes after FIN-002 and the remaining acceptance gates are certified.
