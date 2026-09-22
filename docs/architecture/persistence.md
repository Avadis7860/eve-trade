# Persistence Architecture

Status: STABLE
Scope: IndexedDB persistence
Source of truth: `src/services/indexedDbStore.ts`
Implementation: `IndexedDbStore`
Tests: `character_transaction_persistence.test.ts` and related persistence suites
CI gate: unit suite / persistence validation

## Current schema

Database version: **5**.

Current object stores:
`snapshots`, `history`, `universe_opportunities`, `http_cache`, `market_observations`, `opportunity_observations`, `market_history_daily`, `eve_types`, `catalog_metadata`, `character_transactions`, `character_executions`.

## Semantics

- Character transactions are validated before persistence.
- Observations and execution records have explicit identity fields.
- Catalogue persistence is validated through the canonical catalogue boundary.
- The HTTP cache is transport infrastructure only and currently has no active private-data consumer.

## Known limitation

The store module remains large. A future structural refactor is a separate target and must preserve schema semantics, atomic replacement behavior, provenance and private-data boundaries.

[Contract](../contracts/persistence.md) · [Invariant](../invariants/persistence.md)
