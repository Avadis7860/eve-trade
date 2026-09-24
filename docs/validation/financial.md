# Financial Truth Validation

Status: STABLE / FIN-002 RECOVERY CERTIFIED BY TEST CONTRACT
Scope: economic position lifecycle, provenance, coverage, realized accounting and capital recovery
Source of truth: `src/engine/positionLedger.ts`, `src/engine/realizedFinancialOutcome.ts`
CI gate: unit/domain certification

## Required regression surfaces

- economic direction comes from transaction facts, not market-order side;
- causal FIFO with timestamp ordering;
- same-timestamp transaction-ID ordering;
- partial disposal preserves remaining quantity and does not close the position;
- full disposal closes the position;
- capital recovery is separate from realized P&L;
- the 10,000 @ 100 / 1 @ 140 example retains +40 gross disposal result with -999,860 capital-recovery delta;
- unmatched/oversold quantity remains explicit;
- missing history or origin evidence remains UNKNOWN/PARTIAL;
- missing fee evidence produces null net result/ratios instead of numeric zero;
- cross-character matching requires an explicit common accounting scope;
- character provenance remains distinct from economic owner;
- corporation ownership is preserved only when explicitly supplied;
- cross-location matching without transfer evidence degrades source coverage;
- order IDs remain optional corroborating provenance only.

## Recovered archive evidence

The archive contributed deterministic FIFO/position lifecycle scenarios and coverage/provenance invariants. The archived implementation itself is not the current source of truth.

## Test ownership

- `position_ledger.test.ts`: recovered ledger invariants;
- `financial_truth_recovery.test.ts`: FIN-002 semantic boundary and regression scenarios;
- `realized_financial_outcome.test.ts`: financial outcome/fee regression;
- `traderAnalytics` remains a consumer boundary and is not reimplemented wholesale in this chantier.

## PI / Industry

No new source is introduced. Future production/internal-transfer events must enter the same economic-origin/lot pipeline rather than a parallel accounting engine.
