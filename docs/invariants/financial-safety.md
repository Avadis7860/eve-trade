# FINANCIAL-SAFETY-001

Status: STABLE
Scope: realized P&L and FIFO cost basis
Implementation: `src/engine/realizedFinancialOutcome.ts`
Validation: `src/engine/__tests__/realized_financial_outcome.test.ts`
CI gate: unit suite + corporation boundary where applicable

## Rule

Only buy inventory observed at or before a sale may be consumed. Unmatched sells remain explicit. Missing fee configuration is not an observed zero.

## Failure Mode

Future-inventory contamination, fabricated zero cost basis, or estimated fees presented as observed paid fees.

## Enforcement

Chronological FIFO uses timestamp then transaction ID. Unmatched quantity, fee mode and financial completeness are explicit. `TraderAnalyticsService` projects from this engine rather than redefining accounting.

## Regression Coverage

The realized-financial suite covers causal FIFO, orphan/oversold quantities and observed/estimated/unavailable fee states.
