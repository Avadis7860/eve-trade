# Financial Truth Validation

Status: FIN-001 CERTIFIED / FIN-002 NEXT
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

## Latest CI certification state

Latest verified branch head: e971954e4040b673fd23f5360878ed7a9f99a12f.

CI Foundation & Regression Gate #920 is GREEN, with all required lanes completed successfully. Phase 2.7C SDE Truth Gate #681 is also GREEN.

FIN-001 is certified. Its scope is the deterministic AcquisitionLot / DisposalAllocation / CurrentPosition boundary, causal FIFO, lifecycle, capital recovery separation and provenance preservation. FIN-002 is the next code gate for Performance analytics.
