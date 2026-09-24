# Financial Truth Rebase

Status: ACTIVE / FIN-002 SELECTIVE ARCHIVE RECOVERY
Base main: a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8
Archive reference: archive/ux-03-allocation-contract-2026-09-24 @ 75df2e8f77d8ccc0cd5a2a631661902d1b54fab6

## Purpose

This document records the controlled recovery of still-valid Financial Truth material from the UX-03 archive.

The archive is historical evidence only. It is not a production branch and is not merged or cherry-picked wholesale.

## Method

**Hybrid recovery / reconstruction**

The archive is 516 commits ahead and 99 behind current main and touches 104 files. Current Agent Context, CI, ESI/OAuth, ownership and product boundaries are materially different. Therefore the useful financial material is being reconstructed against current main rather than applied as historical commits.

## Recovery matrix

| Element | Status | Action |
|---|---|---|
| economic position / lifecycle contracts | A/B | reconstructed against current main |
| AcquisitionLot / DisposalAllocation | B | reconstructed with explicit scope/provenance |
| `positionLedger.ts` | B | rebuilt from historical primitive, current interfaces |
| `realizedFinancialOutcome.ts` | B | rebased onto canonical ledger |
| position ledger scenarios | C/B | rewritten and registered in current tests |
| historical coverage/provenance scenarios | C | preserved as executable invariants |
| ADR-0003 | D | revalidated as current decision |
| archived UX-03 allocation UI | E | excluded |
| `portfolioAggregation.ts` / UX-03 UI | E/F | deferred downstream |
| Fleet | E | permanently excluded |
| archived CI / Agent Context | E | excluded |
| unrelated ESI/OAuth changes | E/F | excluded |
| `MarketOrder.is_buy_order` as accounting direction | F | explicitly rejected |

## Financial boundary

`Economic Transaction Fact -> Economic Position Segment -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome`

Accounting reconstruction is scoped by explicit `accounting_scope_id + type_id`.

Character/corporation/issuer/observer are attribution dimensions, not automatic accounting silos.

## Evidence rules

- history coverage defaults to UNKNOWN;
- economic-origin coverage defaults to UNKNOWN;
- source coverage remains distinct from financial completeness;
- fee unavailability prevents net-of-fees claims but does not prevent economic lifecycle closure;
- UNKNOWN/PARTIAL/ERROR/UNAVAILABLE/STALE never become synthetic zero values;
- market order snapshots remain observation/prospective data.

## Profitability rule

Disposal-level realized P&L and capital recovery are different measures.

The whole-position profitability state is closure-gated. A positive partial disposal does not globally mark an open economic position profitable.

The 10,000 @ 100 / 1 @ 140 example is therefore represented as:

- +40 ISK disposal gross result;
- -999,860 ISK capital recovery delta;
- 9,999 remaining units;
- PARTIALLY_REALIZED lifecycle.

## Scope boundaries

No UI resurrection, Fleet restoration, new ESI/OAuth work, CI/Agent Context redesign, or PI/Industry ingestion is part of this recovery.

Future PI/Industry/Internal Transfer sources must enter the same EconomicOrigin -> AcquisitionLot pipeline.

## Reversibility

All changes are isolated to branch `chore/financial-truth-archive-recovery` and PR #82. The archive branch itself remains untouched and can continue serving as historical evidence.
