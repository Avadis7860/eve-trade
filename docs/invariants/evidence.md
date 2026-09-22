# EVIDENCE-IMMUTABILITY-001

Status: STABLE
Scope: opportunity evidence and observations
Implementation: `src/engine/evidence.ts`, opportunity types, `src/services/indexedDbStore.ts`
Validation: evidence-chain, certification and observation-provenance tests
CI gate: unit suite

## Rule

Evidence and observation identity is deterministic and tamper-evident; repeated observations preserve provenance.

## Failure Mode

A recalculation or merge changes historical identity or silently loses observers.

## Enforcement

Canonical serialization/hashing, immutable observation records and additive observer provenance.

## Regression Coverage

Evidence chain, opportunity certification, observation provenance and persistence suites.
