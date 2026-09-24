# Financial Truth Rebase

Status: PRIORITY / FIN-001 CERTIFIED / FIN-002 ACTIVE SEMANTIC REBASE
Scope: FIN-001, ORD-001, FIN-002, DATA-001, CI-003
Related decision: ADR-0003

## Why this chantier exists

The current code contains solid market/ESI and FIFO calculation primitives, but the financial domain boundary is still being re-based around position lifecycle, whole-operation economic progress and incomplete source coverage.

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

## Economic origin and source coverage

A wallet transaction tells us what economic transaction was observed, not why the user originally wanted the acquired stock.

This distinction is mandatory:

- BUY from an ESI wallet transaction can establish a market acquisition fact;
- the same BUY does not establish that the item was intended for trading, PI, industry, fitting, stockpiling or any other purpose;
- SELL establishes a disposal/sale fact, but the market order side that preceded it is not the accounting direction;
- PI output, industrial output, internal transfer and opening/external stock are economically different origins and cannot be fabricated from a market BUY/SELL pair.

The financial core therefore needs a generic origin axis on AcquisitionLot, without introducing the corresponding new source integrations immediately.

Conceptual origin kinds:

- MARKET_ACQUISITION — stock acquired through an observed market transaction;
- PRODUCTION_OUTPUT — stock created by a production/industrial process, including PI when that source is later integrated;
- INTERNAL_TRANSFER — stock moved inside the configured ecosystem with an explicit economic transfer fact;
- UNKNOWN_ORIGIN — stock whose economic origin is not observable from currently ingested sources.

Current scope:

- only MARKET_ACQUISITION is currently backed by an observed financial source;
- PRODUCTION_OUTPUT and other non-market origins are future source contracts, not current inferred facts;
- no per-BUY intent field may be invented to decide whether a market acquisition was “for trade” versus “for PI” versus “for industry”;
- the absence of PI/industry ingestion is a source-coverage limitation, not permission to classify unknown stock as market stock.

This means the current financial result must declare its coverage:

- MARKET_TRACEABLE when the disposal cost lineage is fully attributable to known market-acquisition lots within the declared accounting scope;
- PARTIAL when only part of the relevant economic stock can be attributed and another origin remains unresolved;
- UNAVAILABLE when cost lineage cannot be established without inventing an origin or cost basis.

Unknown origin must never become synthetic quantity-at-zero-cost, synthetic profit, or a fabricated ROI denominator.

### Consequence for current Performance

The system must not present a market-linked result as an ecosystem-complete economic ROI when the underlying stock lineage is not fully covered by the ingested sources.

A historical market BUY followed by a later SELL can only be treated as a causally attributable market lot when the available source coverage supports that lineage. The existence of a BUY of the same type is not, by itself, proof that a later disposal came from that lot.

Example: Super-Tensile Plastics can be produced through PI. If the application does not ingest the user's PI outputs, a historical market BUY of Super-Tensile Plastics must not automatically be treated as the cost origin of a later SELL merely because the type ID matches. The application may report the observed sale and any provable market-linked allocation, but it must not claim an exact ecosystem-wide cost/ROI when an unmodeled origin can account for the stock.

This is a source-coverage problem, not a reason to start a full PI/industry chantier now.

### Future extensibility rule

PI and Industry must enter the same economic-origin/lot framework later:

Economic source event -> AcquisitionLot(origin) -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome

They must not create a parallel profitability engine.

This preserves today's stabilized financial core while preventing today's model from hard-coding “all stock comes from market BUYs”.

## FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY

### FACT

- ESI wallet transaction;
- ESI market-order observation;
- order ID, issuer and ownership fields where exposed;
- timestamp, quantity, unit price and location supplied by the source.

### DERIVED

- AcquisitionLot;
- economic-origin classification when directly supported by the source;
- disposal-to-lot allocation;
- remaining lot quantity;
- remaining cost basis;
- position lifecycle;
- realized P&L on allocated disposals;
- capital committed and cash recovered from known acquisition/disposal facts;
- position-level capital recovery delta/ratio when defined;
- financial source-coverage/completeness state.

### AGGREGATED

- CurrentPosition summaries;
- realized performance totals;
- open exposure summaries;
- capital recovery summaries;
- explicit closed-position counts;
- source-coverage summaries.

### NEW SOURCE

Character Assets is a future source for current quantity/location coverage. It does not, by itself, supply historical acquisition cost basis.

PI and Industry events are future economic-source integrations. They are intentionally not introduced in the current FIN-002 increment.

### POLICY

- lot-matching policy (current foundation: causal FIFO);
- historical coverage boundary;
- opening inventory treatment when history is incomplete;
- treatment of unresolved/unknown-origin stock;
- fee treatment;
- ecosystem boundary and aggregation rules;
- ownership / observer / authenticated-principal attribution inside the ecosystem;
- closure semantics;
- break-even definition (gross or net);
- ROI denominator/scope;
- pricing behavior after break-even;
- semantic labeling of market-traceable versus ecosystem-complete results.

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
- current-market valuation remains separate from realized accounting;
- economic origin and source coverage are explicit;
- unsupported PI/industry origins remain unknown rather than being fabricated as market acquisition.

### FIN-001 — issue #72 — CERTIFIED

Create and validate the AcquisitionLot / CurrentPosition boundary. Preserve provenance and incomplete-history states.

Current implementation:
- deterministic positionLedger.ts reconstruction exists;
- AcquisitionLot, DisposalAllocation and CurrentPosition are first-class typed calculation outputs;
- transaction provenance is explicit at the ledger boundary and is never inferred from optional order/opportunity correlation;
- CurrentPosition exposes a deterministic deduplicated provenance set for the known position facts;
- optional order_id is preserved only as normalized corroborating provenance;
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
- ORD-001 is certified on the certified code head e971954e4040b673fd23f5360878ed7a9f99a12f.

Acceptance:
- one order ID can be observed through multiple principals;
- corporation ownership never becomes character ownership;
- market side does not affect financial transaction direction.

### FIN-002 — issue #74 — ACTIVE SEMANTIC REBASE

Rebuild Performance around lot/position lifecycle, complete ecosystem scope and explicit source coverage, not around character-isolated transaction pools and not around “a sale creates a closed cycle”.

The previous branch increment that prevented cross-character matching exposed the wrong economic boundary. It is an intermediate diagnostic result, not a certified business rule.

Required accounting behavior:

- a transaction remains attributable to the character/corporation/principal that supplied or observed the fact;
- that attribution must not create an automatic accounting silo;
- acquisitions and disposals from different actors may participate in the same lifecycle when they belong to the same configured ecosystem;
- an internal actor/location change does not create a synthetic disposal/acquisition;
- FIFO/cost allocation must operate on the ecosystem position for a type, while preserving every underlying transaction's provenance;
- an economic origin must be explicit when supported by a source;
- a market BUY must not be promoted to “trade intent” merely because it is a BUY;
- unresolved non-market origin remains UNKNOWN/PARTIAL and cannot be assigned a synthetic cost;
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
- a disposal with unresolved source coverage is PARTIAL/UNAVAILABLE rather than a fabricated cost basis or ROI;
- current-market valuation is not inferred from the recovery summary;
- PI/Industry are not introduced as ad-hoc special cases in FIN-002; future source integrations must feed the same origin/lot contract.

### DATA-001 — issue #75 — CERTIFIED FIRST AUDIT

Audit numeric fallbacks and provenance.

Implemented hardening:
- invalid transaction amounts no longer contribute synthetic ISK activity volume;
- missing ROI/margin/per-unit denominators remain unavailable;
- position and disposal provenance survives trader and fleet aggregation;
- missing physical type volume no longer falls back to 0.01 m3 on ESI/catalog resolution;
- order-history activity remains observation-only.

Acceptance:
- absent/invalid values remain explicit;
- no financial path fabricates zero cost, zero inventory or estimated profit;
- source/provenance survives aggregation;
- valid zeroes remain distinguishable from missing/invalid data;
- unresolved physical type data cannot enter a certified calculation as a fabricated volume.

### CI-003 — issue #76 — RESOLVED

Repair the CI validation without weakening the contract.

Resolved during the certified contract rebase:
- frontend typecheck fixture reconciled with lifecycle fields;
- division-by-zero legacy fixture reconciled with the positive type-id invariant;
- corporation ESI mock isolation/credential assertions reconciled with the real request sequence;
- full CI Foundation & Regression Gate and Phase 2.7C SDE Truth Gate passed.

The fixes updated test contracts/fixtures deliberately rather than relaxing ledger validation.

## Blocking rule

No additional financial KPI, profitability ranking, order-to-transaction inference or financial UI certification is allowed until FIN-002 and the remaining data-quality/UX acceptance gates are certified.

UX-03 allocation implementation may resume after the contract gate; proposed allocation remains prospective and must not become a substitute for financial truth.
