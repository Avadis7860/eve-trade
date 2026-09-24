# ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders

Status: ACCEPTED / ORD-001 + FIN-001 CERTIFIED; FIN-002 NEXT
Date: 2026-09-24
Scope: financial truth, performance, portfolio and market-order provenance

## Context

The active UX-03 branch exposed three related semantic problems.

First, a market order's side is not the trader's economic direction. A trader can acquire by taking an existing SELL order and later dispose of the acquired inventory with a SELL order of their own.

Second, a partial disposal is not the closure of the underlying position. An acquisition of 10,000 units followed by a disposal of 1 unit realizes the result of 1 disposed unit, while 9,999 units remain economically open.

Third, the existing performance vocabulary can confuse a per-disposal realized result with the economic state of the whole still-open operation. A positive +40 ISK realized on one unit must not be presented as if 1,000,000 ISK of acquisition capital had already been recovered.

The repository also has a canonical OrderId and an OrderOwnership structure that already distinguishes economic ownership from the observing character. Splitting Character and Corporation into fundamentally different order entities would therefore preserve the wrong conceptual boundary.

## Decision

### 1. MarketOrder is one canonical entity

A market order is identified by CCP order_id. The application uses `MarketOrder` as the canonical domain contract; the legacy `EveCharacterOrder` name is a compatibility alias only.

Its independent axes are:

- market side (is_buy_order);
- issuer character, when supplied by ESI;
- economic owner (character or corporation);
- observing principal / observer set;
- corporation and wallet division when applicable;
- source/provenance;
- freshness and coverage.

Character and corporation are ownership/scope dimensions, not separate order species.

### 2. Economic direction comes from transaction facts

For financial accounting, acquisition/disposition direction comes from the economic transaction fact.

is_buy_order on an observed market order must never be used alone to infer acquisition or disposition.

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

OPEN -> PARTIALLY_REALIZED -> CLOSED

CLOSED is reached only at zero remaining quantity.

### 5. Realized P&L and capital recovery are separate measures

Realized P&L is the accounting result of quantities that have actually been disposed and allocated to known acquisition lots.

At position/operation level, the system must also be able to express the amount of acquisition capital that has been recovered through actual disposition revenue. This is an operational economic-progress measure, not a replacement for realized P&L.

For a fully known valid position, the semantic quantities are:

- capital committed = original acquisition cost;
- cash recovered = disposition revenue already received/observed;
- capital recovery delta = cash recovered - capital committed;
- capital recovery ratio = cash recovered / capital committed when the denominator is known and non-zero;
- realized P&L = realized result on allocated disposed quantities after the applicable fee-state policy;
- remaining quantity and remaining cost basis;
- position lifecycle.

A break-even flag is a POLICY result whose basis must be explicit (for example gross or net of fees). It must not be inferred from an unrelated market snapshot.

For the current FIN-002 primitive, an operation is the contiguous open position segment for one `accounting_scope_id + type_id`: new acquisitions join the active operation while at least one lot from that segment remains open; a new operation starts only after the active segment reaches zero remaining quantity. This is a deterministic ledger boundary, not an inferred trader-intent label.

Example: 10,000 units acquired at 100 ISK and 1 unit disposed at 140 ISK:

- capital committed: 1,000,000 ISK;
- cash recovered: 140 ISK;
- capital recovery delta: -999,860 ISK;
- capital recovery ratio: 0.014%;
- realized gross P&L on the disposed unit: +40 ISK before fees;
- remaining quantity: 9,999;
- remaining cost basis: 999,900 ISK before other accounting effects;
- lifecycle: PARTIALLY_REALIZED;
- break-even: not reached.

The -999,860 ISK figure is therefore a valid capital-recovery measure, but it is not realized P&L. Conversely, the +40 ISK figure is valid realized P&L for the disposed unit, but is not a whole-operation ROI.

Any ROI or margin KPI must declare its scope and denominator. A realized disposal ROI cannot silently become an operation-level ROI.

A whole-position realized result is only complete when the position is fully disposed, unless a separate explicitly marked current-market valuation is used. Market valuation remains unrealized/prospective and must not be presented as realized P&L.

Across duplicate observations, economic ownership is not inferred from the observing credential. When the character and corporation feeds expose the same OrderId, the corporation feed is authoritative for the owner while observer provenance is unioned. Contradictory corporation owners fail closed.

After a policy-defined cash break-even threshold is reached, pricing decisions such as accepting a lower margin remain POLICY decisions. They must not rewrite historical acquisition cost or realized accounting.

### 6. Realized and open state stay separate

The system must expose independently:

- realized P&L for disposed quantities;
- capital recovery progress for the open operation/position;
- remaining quantity;
- remaining cost basis;
- position/lots status;
- unrealized or current-market valuation.

A partial sale must not turn the underlying position into a closed “profitable trade”.

### 7. Provenance and data health are orthogonal

Source provenance, economic ownership, observation principal, freshness, coverage and data health must not be collapsed into one field.

UNKNOWN, PARTIAL, ERROR, STALE and UNAVAILABLE are not numeric zeros.

### 8. Order ID is optional corroboration, never invented

ESI wallet transactions do not provide a trustworthy order ID for this accounting purpose. The application must not synthesize one or map unrelated identifiers such as journal references to order IDs.

### 9. Direct transaction calculations do not expose synthetic observation evidence

`calculateForTransactions()` may internally reuse the calculation primitive for compatibility, but its returned outcome is explicitly marked `TRANSACTION_FACTS` and does not expose a synthetic observation ID. Synthetic execution metadata must never be treated as an observed market correlation.

## Consequences

The existing FIFO engine remains a useful deterministic matching primitive.

The first required architectural change is complete and certified: the calculation boundary now exposes AcquisitionLot / DisposalAllocation / CurrentPosition with deterministic lifecycle, capital recovery and provenance. Performance remains the next boundary for FIN-002.

Performance must expose realized disposal outcomes separately from position-level capital recovery. A future valuation surface may add current-market value, but it cannot be used to backfill realized accounting.

No durable position store is mandated by this ADR. Wallet transactions remain durable FACTS; position/lots are deterministic projections unless a later decision explicitly introduces persistence.

ORD-001 and FIN-001 are implemented and certified. FIN-002 remains the next implementation gate; broader Real Portfolio and Performance certification remains blocked until the Performance lifecycle contract is accepted.

## Required regression scenarios

1. Acquire by taking a SELL order, then dispose through a SELL order.
2. Acquire 10,000 units and dispose 1 unit.
3. Verify +40 ISK realized P&L can coexist with -999,860 ISK capital-recovery delta.
4. Verify a partial position does not count as closed.
5. Verify capital-recovery ratio is scoped to the complete position/operation, not to one matched disposal.
6. Split one acquisition across several disposals.
7. Consume several acquisition lots with one disposal.
8. Encounter a disposal with no known prior acquisition.
9. Observe one corporation order through multiple character credentials.
10. Preserve issuer, economic owner and observer as distinct values.
11. Missing history remains PARTIAL/UNKNOWN rather than zero.