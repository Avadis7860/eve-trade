# Execution

Status: IMPLEMENTED
Scope: execution lifecycle from planned opportunity to observed outcome
Source of truth: `src/engine/executionOutcome.ts`, `src/services/executionTrackingService.ts`
Implementation: execution outcome and tracking services
Tests: execution simulation, outcome, tracking integration

## Current behavior

Execution records link observations/opportunities and transaction IDs. Outcomes classify lifecycle state and preserve partial/ambiguous conditions.

Execution tracking is character-scoped and stores persistent execution records in IndexedDB.

[Correlation](correlation.md) · [Outcomes](outcomes.md)
