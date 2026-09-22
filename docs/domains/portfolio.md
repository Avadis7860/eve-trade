# Portfolio

Status: IMPLEMENTED
Scope: allocation and diversification across opportunities
Source of truth: `src/engine/portfolio.ts`
Implementation: `PortfolioOptimizer`
Tests: portfolio-related engine/property tests

## Current behavior

Portfolio allocation is derived from opportunity profitability/risk inputs and supports diversification constraints. It is a consumer of certified/calculated opportunities, not a replacement for market or financial truth.
