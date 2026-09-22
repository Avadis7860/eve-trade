# Trading Scopes

Status: STABLE
Scope: order selection by economic owner and observer context
Source of truth: `src/engine/orderScoping.ts`
Implementation: `selectOrdersByScope`, `createOrderCollection`
Tests: `order_scoping_contracts.test.ts`, corporation order tests

## Current behavior

Character scope selects character-owned orders and never treats a corporate order as personal merely because the observing character is known.

Corporation scope selects orders whose canonical ownership is the requested corporation.

Collection metadata carries available character/corporation contexts separately from the active scope.

## Related

[Trading orders](orders.md) · [Ownership](ownership.md) · [Order contract](../../contracts/orders.md)
