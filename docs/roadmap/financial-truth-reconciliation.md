# Financial Truth Reconciliation

Status: CLOSED / HISTORICAL RECONCILIATION RECORD
Scope: historical decisions recovered from the UX-03 archive
Current main baseline: 5343b465a5028e9822d486d29da522a6c3531645
Archive reference: archive/ux-03-allocation-contract-2026-09-24 at 75df2e8f77d8ccc0cd5a2a631661902d1b54fab6

## Why this document exists

The archive contains a substantial financial rebase that was not merged into main. The useful part to preserve is the reasoning and unresolved semantic boundary, not the archived implementation.

## Classification

| Material | Classification | Use now |
|---|---|---|
| Current main code/tests/CI | CURRENT IMPLEMENTATION | authoritative for current behavior |
| Archived financial implementation | HISTORICAL | do not import |
| Archived financial contract/ADR | HISTORICAL DECISION | preserve as context |
| New owner requirement on whole-operation positivity | RECONCILED CONTRACT INPUT | incorporated into the accepted Financial Contract; whole-operation profitability remains closure-gated |
| Market snapshots / order books | PROSPECTIVE / CORROBORATING | never substitute for realized accounting |

## Archive sources consulted

The following archive documents were inspected as historical sources. Their contents are not copied into the current financial contract:

- docs/decisions/ADR-0003-economic-position-and-order-model.md
- docs/roadmap/financial-truth-rebase.md
- docs/contracts/financial.md
- docs/domains/finance/financial-truth.md
- docs/ux/ux-03-allocation-contract.md
- docs/ux/trading-terminal-surface-contracts.md
- docs/roadmap/master-plan.md
- docs/roadmap/backlog.md
- docs/roadmap/ux-program.md
- docs/state/current-state.md
- docs/state/known-gaps.md
- docs/state/truth-matrix.md
- docs/validation/ux-03-data-availability.md

These paths refer to the archived branch, not the current main tree, unless a current replacement document is explicitly created and linked elsewhere.
## Preserved economic principles

- Market-order side is a market-mechanism fact, not economic direction.
- Character is not automatically an accounting boundary; observer, issuer and economic owner remain distinct.
- Order ID can support provenance/correlation only where the source supports it; it must not be invented as an economic operation identifier.
- Partial disposal can produce a disposal-level realized result while the underlying position remains open.
- Realized result, capital recovery, lifecycle, current valuation and data health are distinct axes.

## Reconciled semantic boundary

The historical progressive `RECOVERED / POSITIVE` state is retained only as a **capital-recovery measure**.

The accepted Financial Contract separates:

- disposal-level realized result;
- cumulative capital recovery;
- position lifecycle;
- whole-operation / whole-position profitability;
- ROI scope and denominator;
- financial evidence coverage.

A partial disposal may therefore be profitable while the position remains PARTIALLY_REALIZED. Capital recovery may also become RECOVERED/POSITIVE before closure. Neither state authorizes a globally profitable label for the still-open operation.

Whole-operation profitability is closure-gated. The complete operation becomes eligible for a whole-position profitability result only after the causally attributable remaining quantity reaches zero and the available financial evidence supports the requested metric.

This resolves the historical contradiction without importing the archived implementation.

## Future financial re-entry gate

Financial Truth re-entry is now governed by the accepted current-main contract. Future financial changes must begin from current main, identify the canonical implementation/tests, preserve the reconciled semantic boundary and change code only with explicit validation and CI ownership.

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
