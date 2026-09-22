# Order Validation

Status: STABLE
Scope: canonical identity, ownership and corporation orders
Source of truth: order engines/types and their focused suites
Implementation: `src/engine/orderIdentity.ts`, `orderScoping.ts`, `corporationOrder.ts`
Tests: order identity, order scoping, corporation order, ESI service
CI gate: unit + corporation boundary + ESI

## Required regression surfaces

- exact OrderId preservation and unsafe numeric rejection;
- character/corporation scope separation;
- corporation order normalization;
- multi-character observer provenance;
- contradictory ownership fail-closed behavior.
