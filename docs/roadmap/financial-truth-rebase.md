# Financial Truth Rebase

Status: PRIORITY / FIN-001 CERTIFIED / FIN-002 NEXT
Scope: FIN-001, ORD-001, FIN-002, DATA-001, CI-003
Related decision: ADR-0003

## Why this chantier exists

The current code contains solid market/ESI and FIFO calculation primitives, but the financial domain boundary is still being re-based around position lifecycle and whole-operation economic progress.

The target model is:

Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome

while:

MarketOrder Observation -> exposure/provenance

remains a separate axis.

## Ecosystem boundary

The accounting boundary is the complete trading/industrial ecosystem represented by EVE Trade, not an individual character and not an individual corporation.

Characters and corporations are participants/dimensions inside that ecosystem:

- character = acting, observing and authenticated principal;
- corporation = organizational/ownership dimension when explicitly exposed by ESI;
- order issuer/owner = provenance and operational attribution;
- location = physical custody/market location dimension;
- ecosystem = the economic context in which the connected trading, hauling, storage and industrial activity is analyzed.

Therefore:

- a character BUY may fund a later character SELL;
- a corporation-held acquisition may be disposed by a character, and vice versa, when both belong to the same configured ecosystem;
- changing character, corporation, station or market location does not by itself terminate a position lifecycle;
- internal movements must not be converted into synthetic sales/buys merely because the acting principal changes;
- transactions must not be isolated by character_id when that identifier only describes the observer/actor;
- crossing into a different economic ecosystem requires an explicit economic boundary/transfer fact; it must not be inferred from the actor alone.

The application may preserve ownership, observer and principal provenance at transaction level without using those dimensions as automatic accounting silos.

The ecosystem boundary is a product/accounting scope, not a fact invented from an individual ESI credential.

## FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY

### FACT

- ESI wallet transaction;
- ESI market-order observation;
- order ID, issuer and ownership fields where exposed;
- timestamp, quantity, unit price and location supplied by the source.

### DERIVED

- AcquisitionLot;
- disposal-to-lot allocation;
- remaining lot quantity;
- remaining cost basis;
- position lifecycle;
- realized P&L on allocated disposals;
- capital committed and cash recovered from known acquisition/disposal facts;
- position-level capital recovery delta/ratio when defined.

### AGGREGATED

- CurrentPosition summaries;
- realized performance totals;
- open exposure summaries;
- capital recovery summaries;
- explicit closed-position counts.

### NEW SOURCE

Character Assets is a future source for current quantity/location coverage. It does not, by itself, supply historical acquisition cost basis.

### POLICY

- lot-matching policy (current foundation: causal FIFO);
- historical coverage boundary;
- opening inventory treatment when history is incomplete;
- fee treatment;
- ecosystem boundary and aggregation rules;
- ownership / observer / authenticated-principal attribution inside the ecosystem;
- closure semantics;
- break-even definition (gross or net);
- ROI denominator/scope;
- pricing behavior after break-even.

## Whole-operation economics clarification

A partial disposal can produce realized P&L while the complete operation remains deeply unrecovered.

For 10,000 @ 100 with 1 @ 140 disposed:

- realized gross P&L on the disposed unit = +40 ISK;
- capital committed = 1,000,000 ISK;
- cash recovered = 140 ISK;
- position-level recovery delta = -999,860 ISK;
- remaining cost basis = 999,900 ISK;
- lifecycle = PARTIALLY_REALIZED.

The recovery delta is not a realized loss. It is the capital-recovery state of the still-open operation.

This distinction prevents a per-disposal ROI from being presented as the ROI of the complete operation.

## Work order

### Documentation rebase — completed prerequisite

The semantic correction is documented before the next code change:

- realized P&L and capital recovery are separate measures;
- ROI scope must be explicit;
- break-even is a policy state;
- partial disposal never closes a position;
- current-market valuation remains separate from realized accounting.

### FIN-001 — issue #72 — CERTIFIED

Create and validate the AcquisitionLot / CurrentPosition boundary. Preserve provenance and incomplete-history states.

Current implementation:
- deterministic `positionLedger.ts` reconstruction exists;
- `AcquisitionLot`, `DisposalAllocation` and `CurrentPosition` are first-class typed calculation outputs;
- transaction provenance is explicit at the ledger boundary and is never inferred from optional order/opportunity correlation;
- `CurrentPosition` exposes a deterministic deduplicated provenance set for the known position facts;
- optional `order_id` is preserved only as normalized corroborating provenance;
- executable position-ledger regressions cover partial, closed, FIFO, causal and incomplete-source scenarios;
- no durable IndexedDB position source has been introduced.
- CI Foundation & Regression Gate #920: GREEN.
- Phase 2.7C SDE Truth Gate #681: GREEN.

Certification:
- 10,000 acquired + 1 disposed => 9,999 remain;
- the disposed unit can have realized P&L;
- the lot remains PARTIALLY_REALIZED;
- position-level recovery delta is negative when less than the acquisition capital has been recovered;
- no synthetic cost is created for unmatched dispositions.

### ORD-001 — issue #73 — CERTIFIED

Make the canonical MarketOrder model explicit. Keep order identity, market side, issuer, economic owner and observer separate.

Current implementation:
- canonical order identity and multi-observer regressions are certified;
- real corporation payload without an explicit is_buy_order: false is accepted under the documented ESI optional-boolean semantics;
- CI Foundation & Regression Gate #893 is green;
- ORD-001 is certified on branch head `e971954e4040b673fd23f5360878ed7a9f99a12f`.

Acceptance:
- one order ID can be observed through multiple principals;
- corporation ownership never becomes character ownership;
- market side does not affect financial transaction direction.

### FIN-002 — issue #74 — ACTIVE SEMANTIC REBASE

Rebuild Performance around lot/position lifecycle and the complete trading/industrial ecosystem, not around character-isolated transaction pools and not around “a sale creates a closed cycle”.

The current branch increment that prevented cross-character matching exposed the wrong economic boundary. It is an intermediate diagnostic result, not a certified business rule.

Required accounting behavior:
- a transaction remains attributable to the character/corporation/principal that supplied or observed the fact;
- that attribution must not create an automatic accounting silo;
- acquisitions and disposals from different actors may participate in the same lifecycle when they belong to the same configured ecosystem;
- an internal actor/location change does not create a synthetic disposal/acquisition;
- FIFO/cost allocation must operate on the ecosystem position for a type, while preserving every underlying transaction's provenance;
- a separate ecosystem must never consume another ecosystem's inventory without an explicit economic transfer boundary;
- industrial transformations are future first-class economic events and must not be fabricated from market-order observations.

Acceptance:
- 10,000 acquired by character A + 1 disposed by character B in the same ecosystem => the 1 unit can consume A's lot and 9,999 remain;
- a corporation acquisition can be consumed by a character disposal inside the same ecosystem when the configured ecosystem contains both actors;
- character changes, station changes and hauling do not reset the lifecycle;
- cross-ecosystem matching is rejected unless an explicit transfer fact exists;
- provenance preserves source_kind + source_id + principal_scope for every transaction/lot/allocation;
- partial disposal never increments closed-position count;
- closed means remaining position quantity is zero;
- realized P&L, capital recovery and open exposure remain separate;
- recovery delta never becomes realized P&L or whole-operation ROI;
- no current-market valuation is inferred from the recovery summary.

### DATA-001 — issue #75 — CERTIFIED FIRST AUDIT

Audit numeric fallbacks and provenance.

Implemented hardening:
- invalid transaction amounts no longer contribute synthetic ISK activity volume;
- missing ROI/margin/per-unit denominators remain unavailable;
- position and disposal provenance survives trader and fleet aggregation;
- missing physical type volume no longer falls back to `0.01 m³` on ESI/catalog resolution;
- order-history activity remains observation-only.

Acceptance:
- absent/invalid values remain explicit;
- no financial path fabricates zero cost, zero inventory or estimated profit;
- source/provenance survives aggregation;
- valid zeroes remain distinguishable from missing/invalid data;
- unresolved physical type data cannot enter a certified calculation as a fabricated volume.

### CI-003 — issue #76 — RESOLVED

Repair the CI validation without weakening the contract.

Resolved during the certified contract rebase; latest validated branch head is `e971954e4040b673fd23f5360878ed7a9f99a12f`:
- frontend typecheck fixture reconciled with lifecycle fields;
- division-by-zero legacy fixture reconciled with the positive type-id invariant;
- corporation ESI mock isolation/credential assertions reconciled with the real request sequence;
- full CI Foundation & Regression Gate and Phase 2.7C SDE Truth Gate passed.

The fixes updated test contracts/fixtures deliberately rather than relaxing ledger validation.

## Blocking rule

No additional financial KPI, profitability ranking, order-to-transaction inference or financial UI certification is allowed until FIN-002 and the remaining data-quality/UX acceptance gates are certified.

UX-03 allocation implementation may resume after the contract gate; proposed allocation remains prospective and must not become a substitute for financial truth.
