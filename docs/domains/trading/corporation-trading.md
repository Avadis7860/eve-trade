# Corporation Trading

Status: STABLE
Scope: corporation market orders observed through character credentials
Source of truth: `server/gateways/corporationEsiGateway.ts`, `src/services/esi.ts`, `src/engine/corporationOrder.ts`
Implementation: corporation gateway → normalization → application aggregation
Tests: corporation ESI gateway, architecture, corporation order, ESI service
CI gate: [validation/esi-tests.md](../../validation/esi-tests.md) + corporation boundary

## Current behavior

The application resolves the authenticated character's current corporation, then calls corporation ESI endpoints using that character's credential. Active and historical orders are normalized into ownership-aware application orders.

The corporation feed is authoritative when a duplicate canonical OrderId is seen in character/corporation aggregation. Multi-character observations are merged without losing observer provenance.

## Explicit boundary

There is no synthetic corporation ESI credential. Authorization remains attached to the authenticated character.

## Not implemented here

Assets, inventory, logistics and corporation accounting are outside this boundary.
