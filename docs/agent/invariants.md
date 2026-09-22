# Agent Invariants

This file records high-value invariants in compact, indexed form. It complements `AGENTS.md` and should describe behavior visible in the implementation and/or protected by tests.

## ENGINE-PURITY-001

- Scope: `src/engine/**`
- Rule: deterministic domain calculations must not perform network, persistence, DOM or React state operations.
- Validation: engine tests + TypeScript/build.

## DATA-SEMANTICS-001

- Scope: market, catalog and opportunity pipelines
- Rule: `NO DATA ≠ ZERO DATA`.
- Rule: failures, partial data and unknown state remain distinguishable from valid zero-valued business data.
- Validation: market-data quality, failure-semantics and data-contract tests.

## MARKET-IDENTITY-001

- Scope: market order ingestion/aggregation
- Rule: deduplicate orders by CCP `order_id`.
- Validation: order-scoping and market-data regression coverage.

## CHARACTER-ISOLATION-001

- Scope: character transactions and execution correlation/persistence
- Rule: records belonging to one character must never be correlated or queried as another character's records.
- Validation: character transaction, execution correlation and persistence tests.

## EVIDENCE-IMMUTABILITY-001

- Scope: opportunity evidence and market/opportunity observations
- Rule: evidence snapshots and immutable observations must not be silently overwritten.
- Validation: evidence-chain, certification and observation-provenance tests.

## FINANCIAL-SAFETY-001

- Scope: financial engines and monetary calculations
- Rule: protect divisions and invalid numeric inputs; unavailable calculations must not be represented by `NaN` or `Infinity`.
- Validation: financial/property-invariant suites.

## EXECUTION-CORRELATION-001

- Scope: `src/engine/executionCorrelation.ts`, execution persistence
- Rule: execution correlation is scoped by character and observation identity; duplicate character/observation pairs are rejected by the persistence boundary.
- Validation: execution correlation, tracking integration and persistence tests.

## ESI-CLIENT-001

- Scope: `server/utils/esiClient.ts` and callers
- Rule: use the shared backend ESI client rather than reintroducing ad-hoc fetch handling when the shared client covers the request.
- Contract: preserve explicit ETag/304, pagination metadata, ESI error-limit metadata and Retry-After behavior.
- Validation: `server/__tests__/esi_hardening.test.ts`.

## INDEXEDDB-SCHEMA-001

- Scope: `src/services/indexedDbStore.ts`
- Rule: schema/version changes require explicit migration reasoning and corresponding documentation/tests.
- Current implementation: DB version 5 with 11 object stores.
