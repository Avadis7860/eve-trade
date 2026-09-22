# Execution Outcomes

Status: IMPLEMENTED
Scope: post-correlation lifecycle and realized result projection
Source of truth: `src/engine/executionOutcome.ts`, `src/engine/realizedFinancialOutcome.ts`
Implementation: execution outcome + Financial Truth
Tests: execution outcome + realized financial tests

## Current behavior

Execution status distinguishes planned, partial, complete, cancelled and ambiguous states. Financial realization is delegated to Financial Truth so execution tracking cannot create a second FIFO/accounting truth.

The Market Outcome Tracker separately evaluates opportunity survival across 1h, 6h, 24h, 3d and 7d horizons.
