# ORDER-ID-IDENTITY-001

Status: STABLE
Scope: CCP market-order identifiers
Implementation: `src/engine/orderIdentity.ts`, `src/types/order.ts`
Validation: `src/engine/__tests__/order_identity.test.ts`
CI gate: unit suite + ESI/API gates

## Rule

Order IDs are canonical strings and must never lose precision through JavaScript numeric coercion.

## Why

CCP order identifiers can exceed safe integer precision.

## Failure Mode

An unsafe numeric conversion changes identity or breaks deterministic de-duplication.

## Enforcement

`normalizeOrderId` accepts canonical decimal strings and safe integer compatibility, rejects unsafe values, and `compareOrderIds` uses BigInt semantics.

## Regression Coverage

Exact string preservation, unsafe numeric rejection, normalization and BigInt-safe comparison.
