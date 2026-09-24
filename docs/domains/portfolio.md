# Portfolio

Status: IMPLEMENTED SCAFFOLD / CERTIFICATION BLOCKED
Scope: proposed allocation and real portfolio exposure
Source of truth: `src/engine/portfolio.ts`
Implementation: `PortfolioOptimizer`
Tests: portfolio-related engine/property tests

## Current implementation

The optimizer remains a useful foundation for prospective multi-opportunity allocation. The current UX-03 implementation is retained as scaffolding.

## Economic truth boundary

The Real Portfolio side depends on the financial position contract now being re-based:

- acquisition facts come from economic transactions;
- open inventory and cost basis come from AcquisitionLots / CurrentPosition;
- active BUY orders can contribute reserved-capital exposure;
- active SELL orders expose inventory already placed on the market, but do not establish historical acquisition cost;
- market-order side is never used to infer acquisition direction;
- current market valuation remains a projection, not realized financial truth.

Until FIN-001 is accepted, inventory quantity and cost basis that cannot be reconstructed from authoritative sources remain explicitly PARTIAL/UNKNOWN.

## Proposed Allocation boundary

Proposed Allocation is prospective. Its projected profit, ROI, capturable profit, profit/day and confidence signals must not be fed back into realized financial truth.

See [Financial Truth](../domains/finance/financial-truth.md), [FIN-001](https://github.com/Avadis7860/eve-trade/issues/72) and [UX-03 contract](../ux/ux-03-allocation-contract.md).
