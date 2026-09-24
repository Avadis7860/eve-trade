# Financial Contract

Status: PROVISIONAL — SEMANTIC REBASE REQUIRED
Owner: finance domain
Decision: [ADR-0003](../decisions/ADR-0003-economic-position-and-order-model.md)
Implementation: `src/types/financial.ts`, `src/engine/realizedFinancialOutcome.ts`
Validation: FIN-001 / #72, FIN-002 / #74

## Core model

`Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized P&L`

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
- realized P&L for actually disposed quantities.

## AGGREGATED

- CurrentPosition;
- realized performance totals;
- open exposure summaries.

## MARKET / PROSPECTIVE

Market order observations, current books, order exposure and proposed allocation metrics are not realized accounting.

## Position lifecycle

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

Example: acquisition 10,000 @ 100, disposal 1 @ 140:

- realized gross P&L on the 1 allocated unit: +40 ISK before fees;
- remaining quantity: 9,999;
- remaining cost basis: 999,900 ISK before other accounting effects;
- lifecycle: PARTIALLY_REALIZED;
- position: not closed.

## Strict rules

- `is_buy_order` is never accounting direction;
- active BUY orders never establish acquisition cost;
- wallet transaction `order_id` is never invented;
- lot matching is deterministic and explicit;
- future acquisition cannot finance earlier disposition;
- unmatched/oversold quantity remains explicit;
- absent/incomplete data never becomes observed zero.

## Acceptance scenarios

Acquire through a SELL-side market order, then dispose through a SELL-side order; partially dispose a large lot; split disposals across lots; orphan sale; incomplete history; multiple observers of one corporation order.

