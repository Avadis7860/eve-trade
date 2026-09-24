# Financial Contract

Status: PROVISIONAL — FIN-002 SEMANTIC CERTIFICATION IN PROGRESS
Owner: finance domain
Decision: ADR-0003
Implementation: src/types/financial.ts, src/engine/positionLedger.ts, src/engine/realizedFinancialOutcome.ts
Validation: FIN-001 / #72, FIN-002 / #74, DATA-001 / #75

## Core model

Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome

Market orders remain an observation/provenance domain.

### Economic position segment vs trader operation

The canonical financial object is the **economic position segment**, not a trader-intent operation.

A position segment is the contiguous economically open quantity for one explicit `accounting_scope_id + type_id`. New acquisitions join the active segment while quantity remains open. A new segment begins only after the previous segment reaches zero remaining quantity.

This boundary is deterministic and suitable for accounting reconstruction.

It must **not** be described as proof of trader intent, strategy or a user-defined trade. The system cannot infer from transaction timing, market-order side, price or repeated purchases that two acquisitions belonged to one commercial operation.

Any higher-level "operation" view is therefore a projection over a position segment and must never invent a stronger causal relationship than the source evidence supports.

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

Economic reconstruction also carries an explicit coverage envelope.

- **history coverage** answers whether the transaction history supplied to the ledger is known to cover the relevant accounting scope;
- **economic-origin coverage** answers whether the supported economic sources capable of creating the observed inventory are sufficiently represented;
- **source coverage** continues to describe whether the acquisition/disposal cost lineage itself is reconstructable;
- **financial completeness** additionally describes whether the resulting financial outcome, including fee treatment, is fully evidenced.

These dimensions are independent. A set of perfectly valid wallet transactions can still have UNKNOWN history coverage when the collection boundary is not known. A market-traceable FIFO result can therefore remain explicitly incomplete at the ecosystem level.

Without explicit completeness evidence, the product must not promote a derived position into an ecosystem-complete economic operation.


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

## History and origin coverage rules

- a locally coherent transaction subset is not proof of a complete history;
- `MAX_PAGES_GUARD`, interrupted pagination, rate limiting, network failure or an unknown collection boundary make history coverage `PARTIAL` or `UNKNOWN`;
- absence of an orphaned sale does not prove that no prior inventory existed;
- market-only lineage may be `MARKET_TRACEABLE` while broader economic-origin coverage remains `UNKNOWN`;
- ecosystem-complete profitability requires the corresponding explicit coverage contract;
- PI/Industry/internal-transfer sources are deferred and must later enter the same EconomicOrigin -> AcquisitionLot pipeline.

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