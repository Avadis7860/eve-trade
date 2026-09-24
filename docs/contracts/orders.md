# Order Contract

Status: PROVISIONAL — MODEL REBASE REQUIRED
Owner: trading order identity / ownership
Decision: [ADR-0003](../decisions/ADR-0003-economic-position-and-order-model.md)
Implementation: `src/types/character.ts` (`MarketOrder`), `src/engine/orderIdentity.ts`, `src/engine/orderScoping.ts`, `src/engine/corporationOrder.ts`
Validation: existing order/corporation suites + ORD-001 / #73

## Canonical entity

There is one logical `MarketOrder` in the domain. `EveCharacterOrder` remains a compatibility alias during migration; it does not define a separate character-owned entity.

Character and Corporation are ownership/scope dimensions, not two distinct order species.

## Required axes

| Axis | Meaning |
|---|---|
| Order ID | CCP identity |
| Market side | `is_buy_order`; order-book side |
| Issuer | Character who issued the order when exposed by ESI |
| Economic owner | Character or corporation represented by the order |
| Observer | Credential principal(s) that obtained the observation |
| Scope | Authorization/query projection |
| Source | ESI route / durable snapshot provenance |
| Quality | freshness / coverage / validation state |

## Accounting boundary

Market side must never be used to infer an economic acquisition or disposition.

Accounting direction comes from transaction facts. Wallet transactions may not expose an order ID usable for causal accounting; the system must not invent one or map unrelated identifiers to it.

## Failure semantics

- unsafe/non-canonical order IDs are rejected;
- contradictory ownership fails closed;
- observer identity never replaces economic ownership;
- when character and corporation feeds expose the same canonical OrderId, corporation ownership is authoritative while the character-side observation remains provenance;
- conflicting corporation economic owners for one canonical OrderId fail closed;
- missing optional ESI fields remain explicit and are normalized only under the ESI contract;
- an order observation alone never creates a financial acquisition lot.

See [Trading Orders](../domains/trading/orders.md), [Trading Ownership](../invariants/trading-ownership.md) and ORD-001 / #73.
