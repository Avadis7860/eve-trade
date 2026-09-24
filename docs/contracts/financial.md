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

Lifecycle closure is an economic state derived from the position ledger's remaining quantity and causally attributable inventory. It is independent from fee/configuration availability.

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

When fee evidence is `UNAVAILABLE`, gross P&L may remain known but fee-inclusive net P&L, net ROI, margin and profit-per-unit are `UNKNOWN`/`null`; no zero-fee assumption may turn unavailable net evidence into a numeric result.

## Source coverage vs financial completeness

These are independent quality dimensions.

- source coverage describes whether the economic acquisition/disposal lineage is reconstructable.
- financial completeness additionally describes whether the financial result, including fee treatment, is fully evidenced.

A position can therefore be MARKET_TRACEABLE while financial completeness is UNAVAILABLE when its economic cost basis is known but fee configuration is absent. Such a position may still reach CLOSED; it must not be presented as observed net-of-fees profit.

Consumer logic must never use fee availability as a proxy for lifecycle closure.

## Scope rules for ROI, recovery and break-even

A KPI must declare its economic scope.

- Disposal-level ROI describes the quantity allocated to a specific disposal and may be positive while the underlying operation remains `PARTIALLY_REALIZED`.
- Progressive operation recovery is cumulative across all attributable disposals and compares cumulative recovered cash with the **initial capital committed by that operation**.
- Progressive recovery is independent from lifecycle closure. An operation may be `PARTIALLY_REALIZED + RECOVERED` or `PARTIALLY_REALIZED + POSITIVE`.
- Win rate, closed-position ROI, item rankings and category success use whole-position results only; they are closure metrics, not substitutes for progressive recovery.
- Whole-position realized P&L is complete only when the operation is genuinely closed and its economic lineage is reconciled.
- Current-market valuation is not realized P&L.
- Break-even is a `POLICY` state whose basis must be explicit (for example gross or net of fees).
- Fee unavailability must not prevent physical/economic lifecycle closure, but it must prevent the product from presenting a fee-inclusive result as observed fact.

Canonical recovery state is derived from the cumulative recovery delta:

`delta < 0 → NEGATIVE`
`delta = 0 → RECOVERED`
`delta > 0 → POSITIVE`

A later pricing policy may react to break-even, such as accepting a lower margin after capital recovery. That policy must not rewrite historical acquisition cost or accounting results.

## Strict rules

- is_buy_order is never accounting direction;
- active BUY orders never establish acquisition cost;
- wallet transaction order_id is never invented;
- lot matching is deterministic and explicit;
- future acquisition cannot finance earlier disposition;
- unmatched/oversold quantity remains explicit;
- absent/incomplete data never becomes observed zero;
- unavailable fee evidence never becomes a numeric net result;
- cross-location lot allocation without an observed transfer fact remains economically traceable only at `PARTIAL` source coverage;
- realized P&L and capital-recovery delta must never be merged into one field;
- a partial disposal never establishes a closed position.

## Acceptance scenarios

Acquire through a SELL-side market order, then dispose through a SELL-side order; partially dispose a large lot; expose position-level capital recovery; split disposals across lots; orphan sale; incomplete history; multiple observers of one corporation order.