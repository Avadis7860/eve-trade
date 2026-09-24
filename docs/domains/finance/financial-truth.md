# Financial Truth

Status: FIN-002 SEMANTIC CERTIFICATION IN PROGRESS
Scope: economic acquisitions, acquisition lots, positions, disposal allocations and realized financial truth
Source of truth: src/engine/positionLedger.ts and src/engine/realizedFinancialOutcome.ts; target semantic decision in ADR-0003
Implementation: deterministic FIFO position reconstruction + realized calculation primitive
Tests: realized_financial_outcome.test.ts, position_ledger.test.ts plus FIN-001/FIN-002 scenarios

## Purpose

Financial Truth answers five separate questions:

- what economic transaction occurred;
- what inventory/position remains;
- what result is actually realized on disposed quantities;
- how much acquisition capital has been recovered by actual disposals;
- what is only market-derived or prospective.

## Non-negotiable direction rule

market order side is not economic transaction direction.

A trader may acquire by taking an existing SELL order and later dispose using a SELL order. Accounting direction comes from the transaction fact (is_buy / disposition), never from market-order side.

Active BUY orders are evidence of reserved capital/order exposure. They are not acquisition facts.

## Position lifecycle

OPEN -> PARTIALLY_REALIZED -> CLOSED

CLOSED means that the remaining quantity of the relevant lot/position is zero.

Lifecycle is independent from fee/configuration completeness. A position whose economic acquisition/disposal lineage is MARKET_TRACEABLE may reach CLOSED even when fee configuration is unavailable.

## Source coverage vs financial completeness

The financial pipeline keeps two distinct quality axes:

- source coverage describes whether the economic cost lineage is reconstructable;
- financial completeness describes whether the financial result, including fee treatment, is fully evidenced.

Therefore MARKET_TRACEABLE + UNAVAILABLE is a valid state: cost basis and lifecycle are known, while net-of-fees evidence is unavailable. In that state gross disposal P&L may remain known, but net P&L and its net ratios are unavailable. Fee availability must never be used as a proxy for lifecycle closure.

## AcquisitionLot

A lot represents an economic acquisition and preserves, at minimum:

- source kind and source ID;
- transaction ID when available;
- principal scope;
- economic owner;
- type/location;
- quantity acquired;
- remaining quantity;
- unit cost;
- acquired timestamp;
- lifecycle status.

## DisposalAllocation

A disposal consumes causally eligible known inventory under an explicit lot-matching policy.

Each allocation preserves:

- disposition transaction ID;
- acquisition lot ID;
- allocated quantity;
- acquisition unit cost;
- disposal price/revenue;
- realized profit;
- provenance.

A partial disposal is a realized event, not a closed position.

## Position-level capital recovery

Capital recovery is a separate derived economic-progress measure.

For a known valid position:

- capital committed = acquisition cost committed by the position;
- cash recovered = revenue from actual disposals already observed/accepted;
- recovery delta = cash recovered - capital committed;
- recovery ratio = cash recovered / capital committed when defined;
- break-even = a policy state based on an explicitly chosen gross/net basis.

Example:

10,000 @ 100 acquired and 1 @ 140 disposed gives:

- realized gross P&L: +40 ISK before fees;
- recovery delta: -999,860 ISK;
- recovery ratio: 0.014%;
- remaining quantity: 9,999;
- remaining cost basis: 999,900 ISK;
- lifecycle: PARTIALLY_REALIZED.

This prevents a realized +40 ISK allocation from being misread as a +40% ROI for the whole operation.

The recovery delta is not realized P&L, and realized P&L must not be backfilled with the value of unsold inventory.

## Current FIFO primitive

positionLedger.ts reconstructs deterministic FIFO lots and disposal allocations from transaction facts. RealizedFinancialOutcomeEngine projects its existing realized-financial contract from that boundary.

The position ledger is a calculation boundary, not a durable IndexedDB source of truth.

A cross-location allocation can remain matchable because inventory may legitimately move between locations, but without a corresponding transfer fact the lineage is not fully evidenced. Such allocations remain `PARTIAL` rather than silently claiming complete location-level traceability.

## Financial KPIs

Keep these separate:

- realized P&L on disposed quantities;
- capital committed;
- cash recovered;
- capital recovery delta and ratio;
- remaining quantity;
- remaining cost basis;
- lot/position lifecycle state;
- unrealized/current-market valuation.

A “closed trade” count must use lot/position lifecycle, not the mere existence of a matched sale allocation.

Performance keeps two scopes explicit:

- disposal result / ROI: the result of the currently displayed allocation;
- whole-position result / ROI: the cumulative result of the economic position segment, published only once that position closes with a valid reconciled cost basis.

A positive partial disposal may therefore remain visible as a sub-result without making the position profitable. Win rate, closed-position ROI, item ranking and category success use the whole-position result.

## Data completeness

UNKNOWN, PARTIAL, ERROR, STALE and UNAVAILABLE remain explicit. Missing historical acquisition coverage must not be converted to zero cost, zero inventory, or a synthetic recovery state.

See Financial Contract and FIN-001 / #72.