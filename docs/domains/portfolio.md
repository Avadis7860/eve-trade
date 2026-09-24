# Portfolio

Status: IMPLEMENTED / UX-03 INCREMENT 1
Scope: allocation and diversification across opportunities
Source of truth: `src/engine/portfolio.ts`
Implementation: `PortfolioOptimizer`
Tests: portfolio-related engine/property tests

## Current implementation

`PortfolioOptimizer` is a valid domain foundation for capital allocation across an opportunity list.

It currently:
- filters non-viable/non-profitable opportunities through explicit hard gates;
- accepts the resolved cross-item candidate universe used by UX-03;
- ranks with expected realized profit when a sufficiently supported forecast exists, otherwise capturable profit, then profit/day, ROI, liquidity/capture and deterministic tie-breakers;
- allocates under max capital per trade with type/group concentration caps measured against deployed proposed capital;
- enforces integer quantity/capital invariants without fabricating a minimum unit;
- reports category and route exposure and explicit unallocated-capital reasons;
- produces projected net profit, capturable profit, profit/day and projected ROI as prospective metrics.

## UX-03 implementation boundary

The first UX-03 implementation increment is now present on `ux-03/allocation-contract`; full UX-03 certification remains pending.

UX-03 requires:
- explicit treasury scope and capital provenance;
- a cross-item opportunity universe;
- separation of liquid cash, escrow, reserve and inventory exposure;
- concentration percentages based on deployed proposed capital;
- transparent allocation rationale;
- no sole dependence on overall score;
- safe integer quantity/capital rounding;
- explicit degraded-data behavior;
- a documented reason for unallocated capital.

See [UX-03 Allocation / Portefeuille — Contrat métier détaillé](../ux/ux-03-allocation-contract.md) and [UX-03 Data Availability & Derivation Matrix](../validation/ux-03-data-availability.md).

## Economic truth boundary

The Portfolio domain handles **proposed allocation**.

It does not become the source of truth for:
- wallet balances;
- transaction facts;
- realized profit;
- realized ROI;
- inventory quantity not observed by an authoritative asset source.

Realized financial truth remains owned by the Financial Truth / RealizedFinancialOutcomeEngine boundary.

Market-derived inventory valuation is a projection/valuation lens, never realized financial truth.
