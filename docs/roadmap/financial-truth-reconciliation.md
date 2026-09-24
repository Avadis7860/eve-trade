# Financial Truth Reconciliation

Status: RECONCILED / IMPLEMENTATION GUIDE
Scope: historical decisions recovered from the UX-03 archive
Current main baseline: a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8
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
- docs/roadmap/current-chunk.md
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

## Accepted profitability policy

The historical ambiguity is resolved by separating two measurements:

- capital recovery: cash recovered versus capital committed;
- whole-position profitability: closure-gated economic result.

A partial disposal may have a positive disposal-level result and increase capital recovery, but the still-open economic position is not globally profitable. It remains `PARTIALLY_REALIZED` until the known remaining quantity reaches zero.

A recovery state such as `POSITIVE` is therefore not a substitute for whole-position profitability.

## Accepted implementation boundary

The active FIN-002 recovery reconstructs:

Economic Transaction -> Economic Position Segment -> Acquisition Lot -> Disposal Allocation -> Current Position -> Realized Financial Outcome

The position ledger is the canonical lifecycle/FIFO primitive. The archive remains evidence only.

PI and Industry remain future economic sources and are not implemented by this recovery.

## Anti-drift rules

- Do not cherry-pick the archived UX-03 commits wholesale.
- Do not reintroduce archive-only position-ledger files merely because they were tested in the archive.
- Do not turn UNKNOWN, PARTIAL, ERROR, ABSENT or UNAVAILABLE into zero.
- Do not use character/corporation separation as an automatic accounting split.
- Do not use MarketOrder.is_buy_order as economic direction.
- Do not invent economic grouping from order IDs.
- Do not turn this memo into a second source of financial truth.
