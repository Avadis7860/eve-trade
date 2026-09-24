# Financial Truth Validation

Status: FIN-001 CERTIFIED / FIN-002 IN PROGRESS
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
- a positive partial-disposal sub-result remains visible but never enters closed-position win rate, closed-position ROI, top-item ranking or category success statistics;
- a position closed after multiple disposals uses the cumulative result of the full position segment, not just the final disposal, for whole-position profitability and ROI;
- break-even is a policy state, not a substitute for accounting facts.

TraderAnalyticsService and FleetFinancialEngine must remain projections of the accepted position/financial contract, not independent accounting engines.

## Latest CI certification state

Latest verified green branch head before the current FIN-002 semantic increment: 33a2482e6ff992ecf02a1021bbc76f1ce3ca524b.

CI Foundation & Regression Gate #959 is GREEN, with the required lanes completed successfully. Phase 2.7C SDE Truth Gate #720 is also GREEN. The current FIN-002 code increment is newer than that certified head and therefore requires its own CI confirmation before certification.

FIN-001 is certified. FIN-002 remains in progress pending the current increment's CI and final semantic regression gate.
