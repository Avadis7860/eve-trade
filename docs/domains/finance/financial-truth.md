# Financial Truth

Status: SEMANTIC REBASE REQUIRED
Scope: economic acquisitions, acquisition lots, positions, disposal allocations and realized financial truth
Source of truth: current calculation primitives in `src/engine/realizedFinancialOutcome.ts`; target contract in ADR-0003
Implementation: current FIFO calculation + future AcquisitionLot / CurrentPosition ledger
Tests: `realized_financial_outcome.test.ts` plus FIN-001/FIN-002 scenarios

## Purpose

Financial Truth answers four separate questions:

- what economic transaction occurred;
- what inventory/position remains;
- what result is actually realized on disposed quantities;
- what is only market-derived or prospective.

## Non-negotiable direction rule

`market order side` is not `economic transaction direction`.

A trader may acquire by taking an existing SELL order and later dispose using a SELL order. Accounting direction comes from the transaction fact (`is_buy` / disposition), never from market-order side.

Active BUY orders are evidence of reserved capital/order exposure. They are not acquisition facts.

## Target lifecycle

`Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome`

Lifecycle:

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

CLOSED means that the remaining quantity of the relevant lot/position is zero.

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

## Current FIFO primitive

The existing RealizedFinancialOutcomeEngine is a useful deterministic FIFO primitive. It correctly handles causal ordering and unmatched/oversold quantities within its current calculation boundary.

Its architectural limitation is that lots are reconstructed inside a calculation instead of being the authoritative position ledger. FIN-001 addresses this boundary.

## Financial KPIs

Keep these separate:

- realized P&L on disposed quantities;
- remaining quantity;
- remaining cost basis;
- lot/position lifecycle state;
- unrealized/current-market valuation.

A “closed trade” count must use lot/position lifecycle, not the mere existence of a matched sale allocation.

## Data completeness

UNKNOWN, PARTIAL, ERROR, STALE and UNAVAILABLE remain explicit. Missing historical acquisition coverage must not be converted into zero cost or synthetic inventory.

See [Financial Contract](../../contracts/financial.md) and [FIN-001 / #72](https://github.com/Avadis7860/eve-trade/issues/72).
