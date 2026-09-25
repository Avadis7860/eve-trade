# Portfolio

Status: IMPLEMENTED / UX-03 TASK-03 MODEL EXTRACTION ACTIVE
Scope: Portfolio composition for Real Portfolio and Proposed Allocation
Canonical typed contract: `src/types/portfolio.ts`
Allocation implementation: `src/engine/portfolio.ts`
UI consumer: `src/components/PortfolioView.tsx`
Validation:
- `docs/validation/ux-03-portfolio-type-extraction.md`
- `src/engine/__tests__/portfolio_contract.test.ts`

## Domain boundary

Portfolio is a composition layer.

It consumes canonical facts and derived/aggregated outputs from:

- Financial Truth;
- Treasury;
- Orders;
- Market data quality/provenance;
- cross-item Opportunity discovery.

Portfolio does not replace those domains and does not create a second accounting model.

## Real Portfolio

Real Portfolio represents economic exposure already observed or reconstructed.

It may compose:

- resolved treasury context;
- scoped active orders and their derived exposure;
- Financial Truth current positions;
- realized outcomes when available;
- an explicit physical-inventory boundary.

Physical inventory quantity/location remains unavailable until the Character Assets source is separately integrated.

## Proposed Allocation

Proposed Allocation is prospective.

It consumes:

- the resolved treasury scope;
- a cross-item opportunity universe;
- allocation constraints and concentration policy;
- projected opportunity economics;
- prediction/data evidence.

A selected catalog item is navigation context only and must never become the allocation universe.

## Truth and state rules

- Market order IDs identify market-order records and provenance; they are not economic operation IDs.
- `MarketOrder.is_buy_order` never determines accounting direction.
- Character, corporation, issuer and observing principal remain distinct from accounting scope.
- Unknown, partial, error, absent, unavailable and stale states remain explicit.
- Projected values are never realized financial truth.
- Whole-operation profitability remains closure-gated.
- Capital recovery remains distinct from realized P&L.

## Compatibility implementation

`PortfolioSimulation` in `src/types/execution.ts` and the current `PortfolioOptimizer` remain existing implementation/compatibility surfaces.

TASK-03 does not make them the new Portfolio source of truth. Their later alignment is a separate implementation concern consuming this accepted contract.
