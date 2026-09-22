# Character Contract

Status: STABLE
Owner: character domain
Implementation: `src/types/character.ts`, `src/domain/character/CharacterRepository.ts`, character gateway
Validation: character route/API tests

## Purpose

Represent character identity, corporation affiliation, session state, orders and transactions without cross-character contamination.

## Semantic rules

Character ID identifies the authenticated character principal. Corporation ID identifies the economic corporation when applicable; it does not replace the character principal.

Character-scoped data remains attributable to its character. Fleet aggregation is an explicit scope, not accidental cross-character mutation.

## Related

[Authentication](authentication.md) · [Trading ownership](../invariants/trading-ownership.md)
