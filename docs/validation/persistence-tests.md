# Persistence Validation

Status: STABLE
Scope: IndexedDB schema and durable transaction/execution behavior
Source of truth: `src/engine/__tests__/` and `src/services/indexedDbStore.ts`
Implementation: `IndexedDbStore`
CI gate: full unit suite

## Coverage

Character transaction persistence/validation, execution tracking persistence, observation replacement semantics and schema-dependent consumers.

A persistence refactor must preserve all current store identities and domain validation semantics unless a dedicated migration contract is introduced.
