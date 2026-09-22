# Trading Orders

Status: STABLE
Scope: order identity, normalization, ownership and aggregation
Source of truth: `src/types/character.ts`, `src/engine/orderIdentity.ts`, `src/engine/orderScoping.ts`, `src/engine/corporationOrder.ts`
Implementation: ownership-aware order normalization/scoping
Tests: order identity, order scoping, corporation order, ESI suites
CI gate: corporation boundary + unit + ESI

## Purpose

Represent a market order without losing CCP identity or confusing the observing character with the economic owner.

## Current behavior

`OrderId` is a canonical string. Corporation orders carry `owner_type=corporation`, the corporation ID and the authenticated observing character as principal. Legacy `character_id` projections are cleared for corporation-owned orders.

Repeated observations may accumulate `observed_by_character_ids`. Contradictory economic ownership for one canonical OrderId fails closed.

## Scope

Order scopes include character and corporation semantics. Character scopes accept only character-owned orders; corporation-owned orders require a corporation scope.

[Ownership](ownership.md) · [Scopes](scopes.md) · [Corporation trading](corporation-trading.md)
