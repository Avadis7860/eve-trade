# Financial Truth

Status: STABLE / FIN-002 RECONCILED
Scope: economic transactions, positions, lifecycle, realized P&L and evidence coverage
Source of truth: `src/engine/positionLedger.ts`, `src/engine/realizedFinancialOutcome.ts`
Tests: `position_ledger.test.ts`, `financial_truth_recovery.test.ts`, `realized_financial_outcome.test.ts`

## Purpose

Financial Truth answers distinct questions:

1. what economic transaction is observed;
2. what acquisition lots and current position remain;
3. what disposal result is actually realized;
4. how much acquisition capital has been recovered;
5. what is only market-derived/prospective;
6. how complete and attributable the evidence is.

## Current model

The canonical flow is:

`Economic Transaction Fact -> Economic Position Segment -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome`

Market-order observations remain a separate layer.

## Scope

The canonical reconstructed position is scoped by explicit `accounting_scope_id + type_id`. Character/corporation/issuer/observer are dimensions inside that scope, not implicit accounting boundaries.

A multi-character position is therefore valid only when the caller supplies an explicit common economic scope.

## Provenance

Every reconstructed lot/allocation retains source identity and principal scope. Optional order IDs are corroboration only.

## Lifecycle and recovery

`OPEN -> PARTIALLY_REALIZED -> CLOSED`.

A partial disposal can generate realized P&L while the position remains open.

Capital recovery is reported separately and never becomes realized loss or whole-position ROI.

Whole-position profitability is closure-gated under the current policy.

## Evidence

History coverage, economic-origin coverage, source coverage and financial completeness remain independent.

Missing evidence remains UNKNOWN/PARTIAL/UNAVAILABLE and is never replaced by synthetic zeroes.

## Fees

Fee availability is independent from lifecycle. Without fee evidence, gross disposal facts can remain available while the fee breakdown remains explicitly UNAVAILABLE with null amounts, and net P&L/ratios remain unavailable.

## Future origins

`MARKET_ACQUISITION` is the only current observed economic origin. `PRODUCTION_OUTPUT`, `INTERNAL_TRANSFER` and `UNKNOWN_ORIGIN` provide future-compatible vocabulary without starting PI/Industry implementation.

## Related

[Financial contract](../../contracts/financial.md) · [Financial validation](../../validation/financial.md) · [Financial Truth Reconciliation](../../roadmap/financial-truth-reconciliation.md)
