# Financial Truth Rebase

Status: PRIORITY / BLOCKING
Scope: FIN-001, ORD-001, FIN-002, DATA-001
Related decision: [ADR-0003](../decisions/ADR-0003-economic-position-and-order-model.md)

## Why this chantier exists

The current code contains solid market/ESI and FIFO calculation primitives, but the financial domain boundary is still too close to the market-order model.

The target model is:

`Economic Transaction -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome`

while:

`MarketOrder Observation -> exposure/provenance`

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
- realized P&L on allocated disposals.

### AGGREGATED

- CurrentPosition summaries;
- realized performance totals;
- open exposure summaries;
- allocation exposure.

### NEW SOURCE

Character Assets is a future source for current quantity/location coverage. It does not, by itself, supply historical acquisition cost basis.

### POLICY

- lot-matching policy (current foundation: causal FIFO);
- historical coverage boundary;
- opening inventory treatment when history is incomplete;
- fee treatment;
- owner/scope aggregation rules;
- closure semantics.

## Work order

### FIN-001 — issue #72

Create the first-class acquisition-lot and position boundary. Preserve provenance and incomplete-history states.

Acceptance:
- 10,000 acquired + 1 disposed => 9,999 remain;
- the disposed unit can have realized P&L;
- the lot remains PARTIALLY_REALIZED;
- no synthetic cost is created for unmatched dispositions.

### ORD-001 — issue #73

Make the canonical MarketOrder model explicit. Keep order identity, market side, issuer, economic owner and observer separate.

Acceptance:
- one order ID can be observed through multiple principals;
- corporation ownership never becomes character ownership;
- market side does not affect financial transaction direction.

### FIN-002 — issue #74

Rebuild Performance around lot/position lifecycle, not “a sale creates a closed cycle”.

Acceptance:
- partial disposal never increments closed-position count;
- closed means remaining lot/position quantity is zero;
- realized P&L and open exposure are shown separately.

### DATA-001 — issue #75

Audit numeric fallbacks and provenance.

Acceptance:
- absent/invalid values remain explicit;
- no financial path fabricates zero cost, zero inventory or estimated profit;
- source/provenance survives aggregation.

### CI-003 — issue #76

Repair the current red unit-test harness only. Retain the real corporation payload regression.

## Blocking rule

No new financial KPI, profitability ranking, order-to-transaction inference or financial UI certification is allowed before FIN-001/ORD-001/FIN-002/DATA-001 are accepted.

UX-03 allocation implementation may resume after the contract gate; proposed allocation remains prospective and must not become a substitute for financial truth.
