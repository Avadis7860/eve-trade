# Financial Contract

Status: PROVISIONAL — FIN-002 SEMANTIC CERTIFICATION IN PROGRESS
Owner: finance domain
Decision: ADR-0003
Implementation: src/types/financial.ts, src/engine/positionLedger.ts, src/engine/realizedFinancialOutcome.ts
Validation: FIN-001 / #72, FIN-002 / #74, DATA-001 / #75

## Core model

Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized P&L

Market orders remain an observation/provenance domain.

## FACT

Economic transaction facts currently come from ESI wallet transactions:

- transaction ID;
- acquisition/disposition direction;
- type/location;
- quantity;
- unit price;
- timestamp;
- source/principal scope.

## DERIVED

- AcquisitionLot;
- disposal allocation;
- remaining quantity;
- remaining cost basis;
- lifecycle status;
- realized P&L for actually disposed quantities;
- position-level capital recovery progress.

## AGGREGATED

- CurrentPosition;
- realized performance totals;
- open exposure summaries;
- capital committed/recovered summaries;
- recovery ratio when its denominator is known.

## MARKET / PROSPECTIVE

Market order observations, current books, order exposure and proposed allocation metrics are not realized accounting.

Current-market valuation, when available, is an explicitly separate unrealized/prospective measure.

## Position lifecycle

OPEN -> PARTIALLY_REALIZED -> CLOSED

Example: acquisition 10,000 @ 100, disposal 1 @ 140:

- realized gross P&L on the 1 allocated unit: +40 ISK before fees;
- capital committed: 1,000,000 ISK;
- cash recovered: 140 ISK;
- capital recovery delta: -999,860 ISK;
- capital recovery ratio: 0.014%;
- remaining quantity: 9,999;
- remaining cost basis: 999,900 ISK before other accounting effects;
- lifecycle: PARTIALLY_REALIZED.

The -999,860 ISK value measures capital still unrecovered at the position/operation level. It is not a realized loss.

The +40 ISK value measures realized P&L on the disposed unit. It is not a whole-operation ROI.

## Scope rules for ROI and break-even

A KPI must declare its economic scope.

- Disposal-level ROI may describe the allocated disposal(s), including a partial disposal that remains attached to an open position.
- Whole-position performance is published only at a genuine closure boundary and incorporates the cumulative disposals of that position segment.
- Win rate, closed-position ROI, item rankings and category success use whole-position results only; a positive partial disposal is never a profitable closed trade.
- Position/operation-level recovery describes how much acquisition capital has been recovered.
- Whole-position realized P&L is complete only when the position is closed.
- Current-market valuation is not realized P&L.
- Break-even is a POLICY state whose basis must be explicit (for example gross or net of fees).

A later pricing policy may react to break-even, such as accepting a lower margin after capital recovery. That policy must not rewrite historical acquisition cost or accounting results.

## Strict rules

- is_buy_order is never accounting direction;
- active BUY orders never establish acquisition cost;
- wallet transaction order_id is never invented;
- lot matching is deterministic and explicit;
- future acquisition cannot finance earlier disposition;
- unmatched/oversold quantity remains explicit;
- absent/incomplete data never becomes observed zero;
- realized P&L and capital-recovery delta must never be merged into one field;
- a partial disposal never establishes a closed position.

## Acceptance scenarios

Acquire through a SELL-side market order, then dispose through a SELL-side order; partially dispose a large lot; expose position-level capital recovery; split disposals across lots; orphan sale; incomplete history; multiple observers of one corporation order.
