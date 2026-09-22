# Persistence Contract

Status: STABLE
Owner: IndexedDB boundary
Implementation: `src/services/indexedDbStore.ts`
Validation: persistence/transaction/execution tests

## Current schema

Database version 5 with 11 object stores. Existing store names are part of the current persistence contract.

## Semantic rules

Writes that violate domain identity/data-state constraints are rejected. Character transactions require valid identity and numeric boundaries. Observation/execution records retain their identifiers.

## Migration

Schema changes must be explicit and backward-aware. A future structural refactor is a target, not current behavior.
