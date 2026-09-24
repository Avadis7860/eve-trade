# Financial Truth Validation

Status: SEMANTIC REBASE IN PROGRESS
Scope: economic acquisition, position lifecycle, realized accounting, capital recovery and data completeness
Source of truth: src/engine/positionLedger.ts, src/engine/realizedFinancialOutcome.ts
Implementation: position ledger + realized calculation primitive
CI gate: unit/domain certification

## Required regression surfaces

- economic transaction direction independent from market-order side;
- causal FIFO with timestamp ordering;
- same-timestamp transaction-ID ordering;
- acquisition lot remaining quantity;
- partial disposal does not close the position;
- full disposal closes the position;
- explicit unmatched/oversold quantity;
- observed vs estimated vs unavailable fee semantics;
- invalid transaction facts remain explicit and do not become financial zeroes;
- order history does not become accounting buy/sell volume;
- 10,000 @ 100 acquired / 1 @ 140 disposed yields +40 ISK realized gross P&L while keeping -999,860 ISK capital-recovery delta at position level;
- capital-recovery ratio is scoped to the whole known position/operation;
- ROI labels declare whether they are disposal-level or position/operation-level;
- whole-position realized result remains incomplete until closure unless a separate current-market valuation is explicitly used;
- break-even is a policy state, not a substitute for accounting facts.

TraderAnalyticsService and FleetFinancialEngine must remain projections of the accepted position/financial contract, not independent accounting engines.

## Current CI state before any code correction

Last verified branch head: 26f8f7eab0c001cd96604d0053d4f8c69e33a70a.

The associated CI Foundation & Regression Gate is RED for two concrete contract regressions:

1. Frontend typecheck fails because an existing RealizedFinancialOutcome fixture in src/engine/__tests__/realized_financial_outcome.test.ts does not yet provide position_lifecycle and position_remaining_quantity.
2. Unit certification fails in the existing “Division by Zero Protection” scenario because it still supplies typeId = 0, while the new position ledger enforces a strictly positive valid type ID.

The CI result does not justify weakening the position-ledger validation. The corrective work must reconcile old test fixtures/cases with the accepted contract.
