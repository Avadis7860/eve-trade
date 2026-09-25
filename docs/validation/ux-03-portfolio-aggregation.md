# UX-03 — TASK-04 — Portfolio Aggregation

Status: IMPLEMENTED / TASK-04 PR #134
Issue: #88
Source of truth: `src/engine/portfolioAggregation.ts`
Contract: `src/types/portfolio.ts`

## Purpose

Portfolio Aggregation is the composition boundary between canonical domain authorities and the Portfolio consumers.

The aggregator accepts already-resolved inputs and produces a deterministic Real Portfolio snapshot plus a composition seam for the candidate universe and future Proposed Allocation.

It does not acquire data, resolve treasury, create an order scope engine, reconstruct Financial Truth, optimize capital, or execute orders.

## Input contract

`PortfolioAggregationInput` explicitly carries:

- `accounting_scope_id` ;
- a resolved `PortfolioTreasurySnapshot` ;
- an explicit `OrderScope` and `OrderSelectionContext` ;
- order records and their source quality state;
- `CurrentPosition[]` and `RealizedFinancialOutcome[]` plus their source quality state;
- the already-acquired `PortfolioCandidateUniverseSnapshot`.

Treasury scope, order scope and accounting scope are independent dimensions.

## Order composition

Order scoping delegates to `selectOrdersByScope()`.

The aggregate exposes:

- count of scoped orders;
- buy-order escrow when all required escrow evidence exists;
- buy-order remaining notional obligation;
- uncovered obligation only when both obligation and escrow are known;
- sell-order notional exposure;
- canonical order IDs and ownership records.

`order_id` remains a market-order identity/provenance field.

`is_buy_order` is interpreted only inside the market-order exposure view. It is never used to infer economic transaction direction or to construct an economic operation.

No buy-order-to-sell-order matching is performed here.

## Financial Truth composition

`CurrentPosition` and `RealizedFinancialOutcome` are filtered by the explicit accounting scope and transported unchanged.

The aggregator does not:

- perform FIFO;
- create lots or disposal allocations;
- calculate realized profit;
- infer lifecycle;
- convert partial disposal ROI into whole-operation profitability;
- substitute capital recovery for realized P&L.

The canonical financial lifecycle remains `OPEN -> PARTIALLY_REALIZED -> CLOSED`.

## Data quality

The aggregate keeps health and data state explicit.

UNKNOWN / PARTIAL / ERROR / STALE / unavailable evidence never becomes an artificial zero or an authoritative empty business state.

Missing escrow, ownership provenance, invalid order economics, unresolved legacy corporation orders, or foreign-scope financial records degrade the aggregate rather than silently presenting a complete view.

Physical inventory remains:

- coverage: `UNKNOWN`;
- quantity/location/value: null where unavailable;
- source boundary: `NEW_SOURCE`.

This preserves the Character Assets boundary without claiming authoritative net worth.

## Candidate universe

Portfolio Aggregation consumes the candidate-universe snapshot produced by the existing market acquisition path.

It does not re-scan ESI, recompute coverage, or derive freshness from health.

The selected catalog item remains navigation-only.

## Proposed Allocation seam

The final `PortfolioSnapshot` composition validates that Real Portfolio and Proposed Allocation share the same explicit accounting scope.

The allocator itself remains outside TASK-04 and is owned by TASK-05 / #89.

No allocation policy, scoring, prediction, diversification strategy, or execution is implemented here.

## Validation

The contract suite is `src/engine/__tests__/portfolio_aggregation.test.ts` and is registered in `npm test`.

The tests cover:

- treasury scope vs order scope independence;
- character and corporation order scoping through the canonical selector;
- missing escrow without synthetic uncovered obligation;
- preservation of ownership, issuer and order identity;
- accounting-scope filtering of positions/outcomes;
- preservation of Financial Truth lifecycle and realized metrics;
- unknown financial source state without synthetic positions;
- candidate-universe pass-through;
- accounting-scope consistency at the Real/Proposed composition seam.

CI certification remains the final integration proof.
