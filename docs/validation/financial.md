# Financial Truth Validation

Status: STABLE
Scope: realized accounting correctness
Source of truth: `src/engine/__tests__/realized_financial_outcome.test.ts`
Implementation: `RealizedFinancialOutcomeEngine`
CI gate: unit suite

## Required regression surfaces

- causal FIFO with timestamp ordering;
- same-timestamp transaction-ID ordering;
- rejection of future inventory consumption;
- explicit unmatched/oversold quantity;
- observed vs estimated vs unavailable fee semantics;
- no fabricated zero-cost accounting for unmatched sells.

`TraderAnalyticsService` changes should also verify that it remains a projection of the canonical engine.
