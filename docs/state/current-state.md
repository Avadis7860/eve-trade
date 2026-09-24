# Current State

Status: CURRENT
Scope: current main + active working branch
Source of truth: code, tests, CI and manifests

## Current main baseline

Current main head remains aec4c62691723e8fa2ee2bb2f9126249152ad57f after PR #70. The UX-03 branch has not been merged and must not be treated as current main product truth.

The market/ESI retrieval reliability gate is closed and UX-02 Operations is merged/certified.

## Active working branch reality

The only active product branch is ux-03/allocation-contract, associated with PR #71. It remains FROZEN FOR UX-03 FEATURE DEVELOPMENT pending completion of FIN-002 and the remaining data-quality/UX acceptance gates; FIN-001, ORD-001 and the first DATA-001 audit are certified and the financial/order contract rebase plus CI repair are green on the last validated code increment.

The current branch documents the following boundaries:

- market is_buy_order is a market-mechanism fact, not an economic acquisition/disposition fact;
- economic direction for accounting comes from transaction facts;
- active BUY orders are capital reservations/order exposure, not acquisition evidence;
- deterministic AcquisitionLot / CurrentPosition reconstruction exists in src/engine/positionLedger.ts, but its current character-keyed accounting boundary is under FIN-002 rework;
- the target ledger boundary is the complete configured trading/industrial ecosystem, while character/corporation identity remains transaction attribution/provenance;
- the ledger is a calculation boundary, not a durable IndexedDB position source;
- economic origin is a separate accounting dimension from actor identity;
- an ESI wallet BUY can establish market acquisition, but it does not reveal whether the stock was intended for trade, PI, industry or another purpose;
- PI/Industry outputs and internal transfers are not currently ingested financial sources; their absence creates a source-coverage limitation that must remain explicit;
- a partial disposal can create a positive sale allocation while the underlying position remains PARTIALLY_REALIZED;
- Performance closed-trade KPIs require a fully closed position;
- order-history activity is separated from accounting buy/sell volume;
- position-level capital recovery is a dedicated derived axis and is projected through CurrentPosition / RealizedFinancialOutcome into Performance metrics; realized P&L and ROI remain separate;
- market-traceable attribution must not be presented as ecosystem-complete ROI when relevant source coverage is unresolved;
- a historical BUY of the same type is not, by itself, proof that a later SELL consumed that lot.

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
- Performance analytics has both a position-lifecycle boundary and a dedicated capital-recovery projection; broader certification remains gated by FIN-002 and the remaining UX/data-quality acceptance work.
- A complete whole-operation result is not inferred from a single matched disposal.
- The current system does not have a durable source that proves all stock origins; financial outputs must therefore state their supported lineage/coverage.

## Active gaps

- Capital recovery is now a dedicated output in the canonical character-scoped Performance projection, with explicit KNOWN_POSITIONS scope.
- Unrealized/current-market valuation is still a separate future/market-derived surface.
- No durable AcquisitionLot / CurrentPosition store exists.
- Economic origin is not yet a persisted multi-source event model; FIN-002 must add the generic contract without introducing PI/Industry ingestion in this increment.
- DATA-001 first pass preserves unavailable ratios, removes invalid economic-volume coercion, and carries financial provenance through trader analytics.
- Remaining numeric 0 fallbacks are being classified as legitimate accumulators/scope sentinels or separate prospective-domain policies; the financial truth boundary no longer fabricates missing physical volume or ROI.
- CI remains validated for the last code increment; documentation-only commits may advance the branch ref without changing that validated code.

## CI verification

The exact CI result is intentionally not duplicated here because it changes with every branch head. For current certification, inspect PR #71 and its latest workflow runs.

Historical validated baselines may be retained in audit or validation documents, but they must not be presented as evidence for the current branch head.

The context layer at .eve-trade/context-map.json identifies the validation families relevant to each domain.

## Sequencing

Documentation is now aligned with the ecosystem-level accounting correction and the economic-origin/source-coverage limitation. The next code changes target FIN-002; remaining UX-03 feature work stays blocked until the financial sequence is accepted.

The current branch must not be treated as product truth for cross-character/corporation financial matching or ecosystem-complete ROI: CI green confirms regression integrity, not semantic certification.

UX-03 feature work resumes after FIN-002 and the remaining acceptance gates are certified.

## FIN-002 implementation state

FIN-002 implementation is active on PR #71. The accounting boundary is moving to accounting_scope_id + type_id, with character/corporation identity retained as attribution/provenance. AcquisitionLot now has a generic economic-origin contract in preparation for future sources; PI/Industry ingestion remains deferred.

The canonical position ledger is the single reconstruction source for lifecycle and capital recovery. Performance analytics must consume that projection rather than maintaining an independent character-scoped FIFO reconstruction.
