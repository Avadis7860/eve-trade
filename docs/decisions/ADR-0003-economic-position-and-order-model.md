# ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders

Status: PROPOSED / BLOCKING DEPENDENT DEVELOPMENT
Date: 2026-09-24
Scope: financial truth, performance, portfolio and market-order provenance

## Context

The active UX-03 branch exposed two related semantic problems.

First, a market order's side is not the trader's economic direction. A trader can acquire by taking an existing SELL order and later dispose of the acquired inventory with a SELL order of their own.

Second, a partial disposal is not the closure of the underlying position. An acquisition of 10,000 units followed by a disposal of 1 unit realizes the result of 1 disposed unit, while 9,999 units remain economically open.

The repository also has a canonical `OrderId` and an `OrderOwnership` structure that already distinguishes economic ownership from the observing character. Splitting Character and Corporation into fundamentally different order entities would therefore preserve the wrong conceptual boundary.

## Decision

### 1. MarketOrder is one canonical entity

A market order is identified by CCP `order_id`.

Its independent axes are:

- market side (`is_buy_order`);
- issuer character, when supplied by ESI;
- economic owner (character or corporation);
- observing principal / observer set;
- corporation and wallet division when applicable;
- source/provenance;
- freshness and coverage.

Character and corporation are ownership/scope dimensions, not separate order species.

### 2. Economic direction comes from transaction facts

For financial accounting, acquisition/disposition direction comes from the economic transaction fact.

`is_buy_order` on an observed market order must never be used alone to infer acquisition or disposition.

Active BUY orders can establish reserved capital / order exposure. They do not prove that inventory was acquired.

### 3. Acquisition becomes a first-class lot

An economic acquisition creates an AcquisitionLot carrying:

- source kind and source ID;
- transaction ID when available;
- principal scope;
- economic owner;
- type and authoritative location;
- quantity acquired;
- remaining quantity;
- unit cost;
- acquired timestamp;
- lifecycle status.

### 4. Disposals consume lots

A disposal creates one or more DisposalAllocations against causally eligible open lots according to an explicit matching policy.

A disposal may realize P&L without closing the lot.

The lifecycle is:

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

CLOSED is reached only at zero remaining quantity.

### 5. Realized and open state stay separate

The system must expose independently:

- realized P&L for disposed quantities;
- remaining quantity;
- remaining cost basis;
- position/lots status;
- unrealized or current-market valuation.

A partial sale must not turn the underlying position into a closed “profitable trade”.

### 6. Provenance and data health are orthogonal

Source provenance, economic ownership, observation principal, freshness, coverage and data health must not be collapsed into one field.

UNKNOWN, PARTIAL, ERROR, STALE and UNAVAILABLE are not numeric zeros.

### 7. Order ID is optional corroboration, never invented

ESI wallet transactions do not provide a trustworthy order ID for this accounting purpose. The application must not synthesize one or map unrelated identifiers such as journal references to order IDs.

## Consequences

The existing FIFO engine remains a useful deterministic matching primitive.

The required architectural change is to move from transient calculation-only lots and sale-sized TradeCycleRecord semantics toward a first-class AcquisitionLot / CurrentPosition ledger.

UX-03 Real Portfolio and UX-04 Performance are blocked until this contract is implemented and tested.

## Required regression scenarios

1. Acquire by taking a SELL order, then dispose through a SELL order.
2. Acquire 10,000 units and dispose 1 unit.
3. Split one acquisition across several disposals.
4. Consume several acquisition lots with one disposal.
5. Encounter a disposal with no known prior acquisition.
6. Observe one corporation order through multiple character credentials.
7. Preserve issuer, economic owner and observer as distinct values.
8. Missing history remains PARTIAL/UNKNOWN rather than zero.
