# Financial Truth

Status: STABLE
Scope: realized P&L, causal FIFO and financial completeness
Source of truth: `src/engine/realizedFinancialOutcome.ts`, `src/types/financial.ts`
Implementation: `RealizedFinancialOutcomeEngine`
Tests: `realized_financial_outcome.test.ts`
CI gate: unit suite and corporation boundary where applicable

## Purpose

Compute realized results from observed character transactions without fabricating inventory cost or paid fees.

## Current behavior

Buys are consumed by a strict causal FIFO order: timestamp ascending, then transaction ID ascending. A buy is eligible for a sale only when it occurred at or before that sale; future inventory cannot be consumed.

Unmatched or oversold quantities are explicit through `unmatched_sell_quantity` and `PARTIAL` completeness.

Fee state is separated into `OBSERVED`, `ESTIMATED` and `UNAVAILABLE`. Missing fee configuration is not represented as an observed zero fee.

`TraderAnalyticsService` projects from this engine rather than redefining accounting.

## Related

[Financial contract](../../contracts/financial.md) · [Financial safety](../../invariants/financial-safety.md)
