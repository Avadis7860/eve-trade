# Trading Ownership

Status: STABLE
Scope: economic ownership vs observation provenance
Source of truth: `src/engine/corporationOrder.ts`, `src/engine/orderScoping.ts`
Implementation: `OrderOwnership` in `src/types/character.ts`
Tests: corporation order + order-scoping + provenance regressions
CI gate: corporation boundary

## Rule

The character whose credential observed an order is not automatically the economic owner.

## Character order

A character-owned order has `owner_type=character` and an owner ID matching the character owner.

## Corporation order

A corporation-owned order has `owner_type=corporation` and the corporation ID as owner. The authenticated character remains `principal_character_id`.

## Multi-observer behavior

The same economic order may be observed by multiple characters. The observer IDs are additive and deterministically sorted; the primary principal is deterministic and is not used as a substitute for economic ownership.

## Failure mode

Legacy corporate observations cannot be promoted to personal ownership. Contradictory owner identities are rejected rather than arbitrarily merged.
