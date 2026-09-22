# Financial Contract

Status: STABLE
Owner: finance domain
Implementation: `src/types/financial.ts`, `src/engine/realizedFinancialOutcome.ts`
Validation: `realized_financial_outcome.test.ts`, financial engine/config tests

## Shape

Financial outputs distinguish realized profit, fee breakdown, FIFO allocations, unmatched quantity and `FinancialCompleteness`.

## States

`OBSERVED`, `ESTIMATED`, `PARTIAL` and `UNAVAILABLE` express different evidence levels.

## Semantic rules

A missing fee configuration is not an observed zero. Sales cannot consume buy inventory from a future timestamp. Unmatched sells remain explicit.

[Financial safety](../invariants/financial-safety.md)
