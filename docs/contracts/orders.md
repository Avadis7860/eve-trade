# Order Contract

Status: STABLE
Owner: trading order identity/ownership
Implementation: `src/types/order.ts`, `src/types/character.ts`, `src/engine/orderIdentity.ts`, `src/engine/orderScoping.ts`
Validation: `order_identity.test.ts`, `order_scoping_contracts.test.ts`, corporation tests

## Purpose

Preserve CCP market-order identity and economic ownership.

## Contract shape

`OrderId` is a canonical string. Ownership is explicit through `OrderOwnership`, with `owner_type`, `owner_id`, `principal_character_id` and optional observer list.

## Semantic rules

Unsafe numeric IDs are rejected. Corporation orders do not receive a character-owner projection. Legacy `is_corporation` is compatibility metadata only.

## Failure semantics

Contradictory ownership for the same canonical OrderId fails closed.

[Order identity](../invariants/order-identity.md) · [Trading ownership](../invariants/trading-ownership.md)
