# Execution Correlation

Status: IMPLEMENTED
Scope: mapping wallet transactions to execution opportunities
Source of truth: `src/engine/executionCorrelation.ts`
Implementation: `ExecutionCorrelationEngine`
Tests: correlation, tracking integration

## Current behavior

Correlation evaluates candidate transactions against explicit criteria and deterministic match levels. Direct mappings take precedence where provided; ambiguous matches are not guessed away.

Transaction references use canonical order IDs where an order identity is present.
