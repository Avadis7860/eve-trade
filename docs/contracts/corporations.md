# Corporation Contract

Status: STABLE
Owner: corporation ESI boundary
Implementation: `server/gateways/corporationEsiGateway.ts`, `src/engine/corporationOrder.ts`
Validation: corporation ESI gateway, architecture and order tests

## Purpose

Represent corporation data accessed through an authenticated character.

## Semantic rules

The authenticated character is the sole ESI principal. Corporation ID is the economic object. A corporation order must carry corporation ownership while retaining observer principal provenance.

Treasury wallet source distinguishes ESI, manual and unavailable states.

## Failure semantics

Invalid corporation/character IDs and missing credentials are rejected. ESI authorization failures remain visible.

[Corporation boundary invariant](../invariants/corporation-boundary.md)
