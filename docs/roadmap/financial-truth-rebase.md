# Financial Truth Rebase

Status: PRIORITY / IMPLEMENTATION IN PROGRESS
Scope: FIN-001, ORD-001, FIN-002, DATA-001, CI-003
Related decision: ADR-0003

## Why this chantier exists

The current code contains solid market/ESI and FIFO calculation primitives, but the financial domain boundary is still being re-based around position lifecycle and whole-operation economic progress.

The target model is:

Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome

while:

MarketOrder Observation -> exposure/provenance

remains a separate axis.

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
- owner/scope aggregation rules;
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

### FIN-001 — issue #72

Create and validate the AcquisitionLot / CurrentPosition boundary. Preserve provenance and incomplete-history states.

Current implementation:
- deterministic positionLedger.ts reconstruction exists;
- executable position-ledger regressions exist;
- no durable IndexedDB position source has been introduced.

Acceptance:
- 10,000 acquired + 1 disposed => 9,999 remain;
- the disposed unit can have realized P&L;
- the lot remains PARTIALLY_REALIZED;
- position-level recovery delta is negative when less than the acquisition capital has been recovered;
- no synthetic cost is created for unmatched dispositions.

### ORD-001 — issue #73

Make the canonical MarketOrder model explicit. Keep order identity, market side, issuer, economic owner and observer separate.

Current implementation:
- canonical order identity and multi-observer regressions exist;
- real corporation payload without an explicit is_buy_order: false is accepted under ESI optional-boolean semantics.

Acceptance:
- one order ID can be observed through multiple principals;
- corporation ownership never becomes character ownership;
- market side does not affect financial transaction direction.

### FIN-002 — issue #74

Rebuild Performance around lot/position lifecycle, not “a sale creates a closed cycle”.

Current implementation:
- partial positions no longer count as closed trades;
- lifecycle and remaining quantity are exposed on realized outcomes;
- order-history activity is kept separate from accounting buy/sell volume.

Next semantic requirement:
- expose position-level capital recovery separately from realized P&L;
- never turn the recovery delta into realized P&L or a disposal-level ROI.

Acceptance:
- partial disposal never increments closed-position count;
- closed means remaining lot/position quantity is zero;
- realized P&L, capital recovery and open exposure are shown separately.

### DATA-001 — issue #75

Audit numeric fallbacks and provenance.

Acceptance:
- absent/invalid values remain explicit;
- no financial path fabricates zero cost, zero inventory or estimated profit;
- source/provenance survives aggregation;
- valid zeroes remain distinguishable from missing/invalid data.

### CI-003 — issue #76

Repair the current red CI validation without weakening the contract.

Current RED observations on 26f8f7eab0c001cd96604d0053d4f8c69e33a70a:
- frontend typecheck: existing realized-financial test fixture missing the two required lifecycle fields;
- unit certification: division-by-zero fixture still uses invalid typeId = 0;
- Production Build, Server/API/ESI, Browser E2E and SDE Truth Gate succeeded on the same CI run.

The fixes must update test contracts/fixtures deliberately rather than relax ledger validation.

## Blocking rule

No new financial KPI, profitability ranking, order-to-transaction inference or financial UI certification is allowed before FIN-001/ORD-001/FIN-002/DATA-001 are accepted.

UX-03 allocation implementation may resume after the contract gate; proposed allocation remains prospective and must not become a substitute for financial truth.
