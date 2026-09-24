# Character Contract

Status: STABLE
Owner: character domain
Implementation: `src/types/character.ts`, `src/domain/character/CharacterRepository.ts`, character gateway
Validation: character route/API tests

## Purpose

Represent character identity, corporation affiliation, session state, orders and transactions without cross-character contamination.

## Semantic rules

Character ID identifies the authenticated character principal. Corporation ID identifies the economic corporation when applicable; it does not replace the character principal.

Character-scoped data remains attributable to its character. Multiple connected characters are independent operational contexts; hub assignment helps organize where each character manages its orders. No consolidated multi-character economic scope exists.

## Related

[Authentication](authentication.md) · [Trading ownership](../invariants/trading-ownership.md)
