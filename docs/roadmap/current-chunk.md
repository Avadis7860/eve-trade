# Current Chunk

Status: FINANCIAL MODEL REBASE / IMPLEMENTATION IN PROGRESS
Scope: UX-03 allocation workstream held pending financial/order model correction
Reference: [UX-03 Allocation Contract](../ux/ux-03-allocation-contract.md)
Decision: [ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders](../decisions/ADR-0003-economic-position-and-order-model.md)
Financial workstream: [Financial Truth Rebase](financial-truth-rebase.md)

## Objective

The previous UX-03 implementation increment is now treated as scaffolding, not a certified financial contract.

Deep review of the active branch identified two model-level issues:

1. Market-order side is not economic direction. A trader may acquire by taking an existing SELL order and later dispose by placing a SELL order.
2. A partial disposal does not close the underlying position. A 1-unit disposal from a 10,000-unit acquisition may realize P&L on the disposed unit while 9,999 units remain open.

Market observation, economic transaction, position lifecycle and realized financial state must therefore remain distinct.

## Current decision

- PR #71 remains open for traceability but is not a merge candidate.
- No new financial, allocation, profitability or execution behavior should be added during the contract rebase.
- The existing FIFO calculation remains useful as a mathematical primitive.
- Active BUY orders are valid evidence for reserved capital/order exposure only. They are not acquisition facts.

## Current implementation progress

- FIN-001 now has a deterministic AcquisitionLot / CurrentPosition reconstruction primitive and executable regression scenarios.
- FIN-002 now carries position lifecycle on realized disposal events and counts only fully closed positions in closed-trade KPIs.
- ORD-001 has multi-observer canonical-order regression coverage preserving issuer, owner and observer as separate axes.
- CI-003 corrected the real-corporation-payload mock so unrelated in-flight requests cannot satisfy or break the focused credential assertion.

## Priority work

1. FIN-001 / issue #72 — acquisition lots + position ledger.
2. ORD-001 / issue #73 — one canonical MarketOrder with issuer / owner / observer dimensions.
3. FIN-002 / issue #74 — Performance lifecycle based on positions/lots.
4. DATA-001 / issue #75 — provenance and zero-fallback audit.
5. CI-003 / issue #76 — repair the red CI unit harness without weakening the real-payload regression.

## Explicit freeze

Until the contract reset is accepted:

- no new allocation feature;
- no new realized-profit KPI;
- no new order-to-transaction correlation heuristic;
- no Assets integration merely to mask accounting ambiguity;
- no real order placement, cancellation or allocation execution;
- no change that turns UNKNOWN / PARTIAL / ERROR / ABSENT into zero.

## Historical certified work

P0 market/ESI reliability and UX-02 Operations remain certified historical foundations. This reset does not reopen those completed contracts.

## Validation gate

Implementation may resume only after:

- ADR-0003 is accepted;
- FIN-001 has an executable AcquisitionLot/CurrentPosition contract and regressions;
- ORD-001 has canonical order provenance regressions;
- FIN-002 has position-lifecycle acceptance cases;
- DATA-001 has completed the first data-state audit;
- CI is green on the branch.
