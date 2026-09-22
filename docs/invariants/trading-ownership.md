# TRADING-OWNERSHIP-001

Status: STABLE
Scope: economic ownership vs observation provenance
Implementation: `src/engine/orderScoping.ts`, `src/engine/corporationOrder.ts`
Validation: order-scoping, corporation-order and provenance tests
CI gate: corporation boundary

## Rule

The observing character is not sufficient evidence of economic ownership.

## Why

Corporation orders can be observed with a character credential but remain economically owned by the corporation.

## Failure Mode

A corporation order is re-labeled as a personal character order.

## Enforcement

Canonical `OrderOwnership` carries `owner_type/owner_id` separately from `principal_character_id` and observer IDs. Contradictory owners for one canonical OrderId fail closed.

## Regression Coverage

Legacy corporate observations, fresh corporation normalization, corporation scope and multi-character provenance are covered.
