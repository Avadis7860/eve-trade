# Financial Truth Reconciliation

Status: RECONCILIATION REQUIRED / NOT AN IMPLEMENTATION CONTRACT
Scope: historical decisions recovered from the UX-03 archive
Current main baseline: aec4c62691723e8fa2ee2bb2f9126249152ad57f
Archive reference: archive/ux-03-allocation-contract-2026-09-24 at 75df2e8f77d8ccc0cd5a2a631661902d1b54fab6

## Why this document exists

The archive contains a substantial financial rebase that was not merged into main. The useful part to preserve is the reasoning and unresolved semantic boundary, not the archived implementation.

## Classification

| Material | Classification | Use now |
|---|---|---|
| Current main code/tests/CI | CURRENT IMPLEMENTATION | authoritative for current behavior |
| Archived financial implementation | HISTORICAL | do not import |
| Archived financial contract/ADR | HISTORICAL DECISION | preserve as context |
| New owner requirement on whole-operation positivity | RECONCILIATION INPUT | must be accepted explicitly before financial code |
| Market snapshots / order books | PROSPECTIVE / CORROBORATING | never substitute for realized accounting |

## Preserved economic principles

- Market-order side is a market-mechanism fact, not economic direction.
- Character is not automatically an accounting boundary; observer, issuer and economic owner remain distinct.
- Order ID can support provenance/correlation only where the source supports it; it must not be invented as an economic operation identifier.
- Partial disposal can produce a disposal-level realized result while the underlying position remains open.
- Realized result, capital recovery, lifecycle, current valuation and data health are distinct axes.

## Contradiction that remains open

The historical contract permitted progressive states such as PARTIALLY_REALIZED + RECOVERED / POSITIVE once cumulative recovery crossed a defined threshold.

The later owner requirement says the complete economic operation remains negative until the economic position is fully closed, even when one or more individual disposals are profitable.

These statements can describe different measurements, but they cannot share one undisclosed profitability status. The repository must explicitly define at least:

- disposal-level realized result;
- cumulative capital recovery;
- position lifecycle;
- whole-operation/whole-position profitability;
- the scope and denominator of ROI;
- the coverage required before an ecosystem-level result can be presented.

Until that contract is accepted, no code should infer a whole-operation positive state from partial recovery.

## Future financial re-entry gate

The next financial chantier after this agent-context hardening should begin from current main, not from the archive. It should first accept the reconciled contract, then identify current canonical implementations and tests, then change code only with explicit validation and CI ownership.

The candidate conceptual pipeline recovered from the archive is:

Economic Source -> Economic Origin -> Acquisition Lot -> Disposal Allocation -> Current Position -> Realized Financial Outcome

This is candidate architectural vocabulary, not an accepted implementation contract. PI and Industry are not part of the present chantier and must not be added here.

## Anti-drift rules

- Do not cherry-pick the archived UX-03 commits wholesale.
- Do not reintroduce archive-only position-ledger files merely because they were tested in the archive.
- Do not turn UNKNOWN, PARTIAL, ERROR, ABSENT or UNAVAILABLE into zero.
- Do not use character/corporation separation as an automatic accounting split.
- Do not use MarketOrder.is_buy_order as economic direction.
- Do not invent economic grouping from order IDs.
- Do not turn this memo into a second source of financial truth.
