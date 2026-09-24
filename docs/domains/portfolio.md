# Portfolio

Status: IMPLEMENTED / UX-03 CONTRACT ENRICHED
Scope: allocation and diversification across opportunities
Source of truth: `src/engine/portfolio.ts`
Implementation: `PortfolioOptimizer`
Tests: portfolio-related engine/property tests

## Current implementation

`PortfolioOptimizer` is a valid domain foundation for capital allocation across an opportunity list.

It currently:
- filters non-viable/non-profitable opportunities;
- ranks by overall score;
- allocates under max capital per trade;
- enforces concentration caps by type and group;
- reports category and route exposure;
- produces projected profit, profit/day and weighted ROI.

## UX-03 contract boundary

The optimizer is not yet the complete UX-03 implementation.

UX-03 requires:
- a cross-item opportunity universe;
- explicit treasury scope and capital provenance;
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
