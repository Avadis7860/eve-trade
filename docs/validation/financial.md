# Financial Truth Validation

Status: SEMANTIC REBASE IN PROGRESS
Scope: economic acquisition, position lifecycle, realized accounting and data completeness
Source of truth: `src/engine/positionLedger.ts`, `src/engine/realizedFinancialOutcome.ts`
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
- order history does not become accounting buy/sell volume.

`TraderAnalyticsService` and `FleetFinancialEngine` must remain projections of the accepted position/financial contract, not independent accounting engines.
