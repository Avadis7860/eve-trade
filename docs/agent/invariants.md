# Agent Invariants

This file records high-value invariants in a compact form. It does not replace `AGENTS.md`; it provides an indexed navigation surface for agents.

## ENGINE-PURITY-001

- Scope: `src/engine/**`
- Rule: deterministic domain calculations must not perform network, persistence, DOM or React state operations.
- Validation: engine tests + TypeScript/lint.

## DATA-SEMANTICS-001

- Scope: market, catalog and opportunity pipelines
- Rule: `NO DATA ≠ ZERO DATA`.
- Rule: failures, partial data and unknown state must remain distinguishable from valid zero-valued business data.

## MARKET-IDENTITY-001

- Scope: market order ingestion/aggregation
- Rule: deduplicate orders by CCP `order_id`.

## CHARACTER-ISOLATION-001

- Scope: character transactions and execution correlation
- Rule: records belonging to one character must never be correlated with another character.

## EVIDENCE-IMMUTABILITY-001

- Scope: opportunity evidence and observations
- Rule: evidence snapshots and immutable observations must not be silently overwritten.

## FINANCIAL-SAFETY-001

- Scope: financial engines
- Rule: protect divisions and invalid numeric inputs; never emit NaN/Infinity as a substitute for an unavailable calculation.

## ESI-CLIENT-001

- Scope: `server/utils/esiClient.ts` and callers
- Rule: use the shared ESI client rather than reintroducing ad-hoc fetch handling when the shared client covers the request.
- Contract: preserve explicit ETag/304 and pagination metadata.

## INDEXEDDB-SCHEMA-001

- Scope: `src/services/indexedDbStore.ts`
- Rule: schema/version changes require explicit migration reasoning and corresponding documentation updates.
- Current documented version: v5.
