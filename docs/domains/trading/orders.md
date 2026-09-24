# Trading Orders

Status: STABLE FOUNDATION — ORD-001 CERTIFIED
Scope: canonical order identity, market side, economic ownership and observation provenance
Source of truth: `src/types/order.ts`, `src/engine/orderIdentity.ts`, `src/engine/orderScoping.ts`, `src/engine/corporationOrder.ts`

## Purpose

Represent one CCP market order without turning character and corporation observations into separate financial species. The canonical application type is `MarketOrder`; `EveCharacterOrder` is a compatibility alias only; no separate character-order entity exists.

## Canonical dimensions

A canonical MarketOrder conceptually retains:

- `order_id` — CCP identity;
- `is_buy_order` — side of the observed market order;
- issuer — character who issued the order when exposed by ESI;
- economic owner — character or corporation represented by the order;
- observing principal / observer set — credential(s) that observed it;
- corporation / wallet division when applicable;
- source and provenance;
- freshness, coverage and data health.

The same order may legitimately have different observer principals while preserving one economic owner.

## Critical financial boundary

`is_buy_order` is **not** an accounting direction.

A trader can acquire by taking a SELL order and later dispose of the acquired inventory through a SELL order. Therefore the accounting direction must come from the economic transaction fact, not from observed market order side.

Active BUY orders are relevant for reserved capital and exposure. They do not establish historical acquisition cost.

## Scope

Character and corporation scopes remain valid for authorization, visibility and filtering. They are dimensions around the canonical order, not separate order entity classes.

## Failure semantics

Contradictory economic ownership for one canonical OrderId fails closed. Observation by a character never promotes that observer to economic owner.

See [Order Contract](../../contracts/orders.md), [Ownership](ownership.md) and ORD-001 / #71.
