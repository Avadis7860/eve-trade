# Current Chunk

Status: FIN-001 CERTIFIED / FIN-002 NEXT / UX-03 FEATURE WORK FROZEN
Scope: UX-03 allocation workstream held pending financial/order model correction
Reference: UX-03 Allocation Contract
Decision: ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders
Financial workstream: Financial Truth Rebase

## Objective

The previous UX-03 implementation increment remains scaffolding. The financial contract reset is now partially certified: ORD-001 and FIN-001 are closed; FIN-002 is the next gate.

Deep review of the active branch identified three model-level issues:

1. Market-order side is not economic direction. A trader may acquire by taking an existing SELL order and later dispose by placing a SELL order.
2. A partial disposal does not close the underlying position. A 1-unit disposal from a 10,000-unit acquisition may realize P&L on the disposed unit while 9,999 units remain open.
3. A per-disposal realized result must not be presented as the whole-operation economic result while most acquisition capital remains unrecovered.

Market observation, economic transaction, position lifecycle, realized financial state and position-level capital recovery must therefore remain distinct.

## Current decision

- PR #71 remains open for traceability but is not a merge candidate.
- No new financial, allocation, profitability or execution behavior should be added during the contract rebase.
- The existing FIFO calculation remains useful as a mathematical primitive.
- Active BUY orders are valid evidence for reserved capital/order exposure only. They are not acquisition facts.
- Capital-recovery progress is a derived position/operation metric, not realized P&L.
- ROI scope and denominator must be explicit.
- Break-even is a policy state, not an accounting fact.
- Current-market valuation remains separate from realized accounting.

## Current implementation progress

- FIN-001 now has a deterministic AcquisitionLot / CurrentPosition reconstruction primitive and executable regression scenarios.
- FIN-002 now carries position lifecycle on realized disposal events and counts only fully closed positions in closed-trade KPIs.
- ORD-001 has multi-observer canonical-order regression coverage preserving issuer, owner and observer as separate axes.
- CI-003 corrected the real-corporation-payload mock so unrelated in-flight requests cannot satisfy or break the focused credential assertion.
- Documentation rebase captures the additional whole-operation capital-recovery semantics before the next code modification.

## Priority work

1. FIN-002 / issue #74 — Performance lifecycle and position-level capital recovery.
2. Final UX-03 implementation — order visibility/column personalization and Portfolio decision-vs-diagnostic density.
3. UX-04 Performance — after the financial lifecycle contract is accepted.

## Explicit freeze

Until FIN-002 and the remaining UX/data acceptance gates are certified:

- no new allocation feature;
- no new realized-profit KPI;
- no new order-to-transaction correlation heuristic;
- no Assets integration merely to mask accounting ambiguity;
- no real order placement, cancellation or allocation execution;
- no change that turns UNKNOWN / PARTIAL / ERROR / ABSENT into zero;
- no conversion of capital-recovery shortfall into realized accounting loss.

## Historical certified work

P0 market/ESI reliability and UX-02 Operations remain certified historical foundations. This reset does not reopen those completed contracts.

## Validation gate

Implementation may resume only after:

- ADR-0003 is accepted;
- FIN-001 has an executable AcquisitionLot/CurrentPosition contract and regressions, and is CI-certified;
- ORD-001 has canonical order provenance regressions, and is certified;
- FIN-002 has position-lifecycle and capital-recovery acceptance cases and is next;
- DATA-001 has completed the first data-state audit;
- CI regressions are corrected and the branch is green on CI #920.
