# INDEXEDDB-SCHEMA-001

Status: STABLE
Scope: local durable persistence
Implementation: `src/services/indexedDbStore.ts`
Validation: persistence and character transaction suites
CI gate: unit suite

## Rule

Schema version and store identity are explicit. Domain-invalid records must not be persisted as valid facts.

## Failure Mode

Silent schema drift, lost transaction identity, or private data crossing ownership boundaries.

## Enforcement

Database version 5, explicit object stores, validation before writes, and explicit replacement semantics.

## Regression Coverage

Character transaction persistence, execution tracking integration and related domain repository tests.
