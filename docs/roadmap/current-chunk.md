# Current Chunk

Status: FIN-001 CERTIFIED / FIN-002 ACTIVE SEMANTIC REBASE / UX-03 FEATURE WORK FROZEN
Scope: UX-03 allocation workstream held pending financial/order model correction
Reference: UX-03 Allocation Contract
Decision: ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders
Financial workstream: Financial Truth Rebase

## Objective

The previous UX-03 implementation increment remains scaffolding. The financial contract reset is now partially certified: ORD-001 and FIN-001 are closed; FIN-002 is the next gate.

Deep review of the active branch establishes two complementary boundaries:

1. The accounting boundary is the complete configured trading/industrial ecosystem, not an individual character or corporation.
2. Financial completeness depends on economic-source coverage, not merely on finding a BUY and a SELL of the same type.

The product must therefore keep these dimensions distinct:

- market observation;
- economic transaction;
- economic origin;
- position lifecycle;
- realized financial state;
- position-level capital recovery;
- source coverage/completeness;
- ecosystem attribution.

## Current decision

- PR #71 remains open for traceability but is not a merge candidate.
- No new financial, allocation, profitability or execution behavior should be added during the contract rebase.
- The existing FIFO calculation remains useful as a mathematical primitive, but its current character-isolated boundary is not the final economic contract.
- Active BUY orders are valid evidence for reserved capital/order exposure only. They are not acquisition facts.
- An ESI wallet BUY can establish a market acquisition fact, but it does not establish the user's intent for that stock. The system must not invent “for trade” vs “for PI” vs “for industry”.
- Characters and corporations remain attributable actors inside the same ecosystem; changing actor does not automatically break the economic lifecycle.
- Capital-recovery progress is a derived position/operation metric, not realized P&L.
- ROI scope and denominator must be explicit.
- Break-even is a policy state, not an accounting fact.
- Current-market valuation remains separate from realized accounting.
- Unknown/unmodeled economic origin must remain UNKNOWN/PARTIAL/UNAVAILABLE; it must not be converted to zero cost or synthetic ROI.
- Cross-ecosystem matching requires an explicit economic boundary/transfer fact; actor identity alone is not sufficient.
- PI/Industry integration is deliberately deferred. When introduced, those sources must produce economic-origin events into the existing lot/position framework rather than a second accounting engine.

## Current implementation progress

- FIN-001 has a deterministic AcquisitionLot / CurrentPosition reconstruction primitive and executable regression scenarios.
- FIN-002 currently carries position lifecycle on realized disposal events and counts only fully closed positions in closed-trade KPIs, but the active increment that isolated characters is explicitly under semantic rework.
- The next FIN-002 implementation must move accounting matching to the ecosystem position while preserving issuer, owner, observer and principal provenance as separate axes.
- The next FIN-002 implementation must also introduce the generic economic-origin/source-coverage contract without implementing PI/Industry ingestion.
- Market-traceable results must be distinguishable from ecosystem-complete financial truth.
- A historical market BUY of a type is not sufficient proof that a later SELL consumed that lot when the same stock can originate from an unmodeled source such as production. The system must not claim an exact cost/ROI beyond the supported lineage.
- ORD-001 has multi-observer canonical-order regression coverage preserving issuer, owner and observer as separate axes.
- CI-003 corrected the real-corporation-payload mock so unrelated in-flight requests cannot satisfy or break the focused credential assertion.
- Documentation rebase now captures the ecosystem boundary, whole-operation recovery semantics and economic-origin/source-coverage limitation before the next code modification.

## Priority work

1. FIN-002 / issue #74 — ecosystem-level Performance lifecycle, source coverage and position-level capital recovery.
2. Final UX-03 implementation — order visibility/column personalization and Portfolio decision-vs-diagnostic density.
3. UX-04 Performance — after the financial lifecycle contract is accepted.

## Explicit freeze

Until FIN-002 and the remaining UX/data acceptance gates are certified:

- no new allocation feature;
- no new realized-profit KPI;
- no new order-to-transaction correlation heuristic;
- no actor-isolation rule that treats character/corporation identity as an accounting boundary;
- no Assets integration merely to mask accounting ambiguity;
- no PI or Industry integration as a shortcut for ROI calculation;
- no per-transaction “intent” classification invented from BUY/SELL direction;
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
- FIN-002 has ecosystem-level position-lifecycle, source-coverage and capital-recovery acceptance cases and is next;
- DATA-001 has completed the first data-state audit;
- CI regressions are corrected and the relevant gate is green for the current branch head; a green intermediate regression gate does not by itself constitute semantic certification.
