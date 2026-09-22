# Execution Contract

Status: IMPLEMENTED
Owner: execution domain
Implementation: `src/types/execution.ts`, execution engines/services
Validation: execution correlation, outcome and tracking suites

## Shape

Execution records identify observation/opportunity context, linked transaction IDs, lifecycle status and correlated order IDs.

## Semantic rules

Correlation is deterministic and may remain ambiguous. Execution lifecycle status does not replace Financial Truth for realized accounting.

## Failure semantics

Partial, ambiguous and unmatched transaction states are represented explicitly rather than silently completed.
