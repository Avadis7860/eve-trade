# Current Chunk

Status: ACTIVE
Scope: UX-03 / TASK-01 — Relecture et rebase du contrat Allocation / Portefeuille
Branch: ux-03/allocation-contract
Base: main @ 5343b465a5028e9822d486d29da522a6c3531645
PR: #93
Issue: #85

## Delivery status

This chantier is documentation/contract-only.

No UX-03 product code is being recovered from the archive.
No Financial Truth implementation is being reintroduced.
No live order execution or allocation engine change is authorized by this task.

## Objective

Produce the accepted current UX-03 Allocation / Portfolio contract from:

- the historical UX-03 contract as reference;
- the accepted Financial Truth contract on current main;
- the current product/UX surface responsibilities;
- explicit FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY boundaries.

## Reconciled semantic decisions

- Economic operation is reconstructed from economic transaction / position lineage.
- A market BUY/SELL order is a mechanism/provenance record, not an economic operation.
- CCP order IDs are corroborating order provenance only.
- Character, corporation, issuer and observer are distinct attribution/provenance dimensions; they are not automatic accounting silos.
- Explicit accounting scope remains the accounting boundary.
- Partial disposal can produce a disposal-level realized result while the position remains PARTIALLY_REALIZED.
- Capital recovery is separate from whole-operation profitability.
- Whole-operation profitability is closure-gated.
- EJECT / RETAIN remains a POLICY decision and never rewrites Financial Truth.
- Real Portfolio and Proposed Allocation remain separate.
- UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE / STALE never become numeric zero.

## Scope exclusions

- No cherry-pick or bulk copy from archive/ux-03-allocation-contract-2026-09-24.
- No new ESI acquisition path unless the accepted contract later identifies a genuine NEW SOURCE.
- No PI/Industry ingestion.
- No PortfolioOptimizer implementation changes in this task.
- No UI implementation in this task.

## Completion gate

This task is complete only when:

1. the rebased UX-03 contract is accepted;
2. roadmap/current-state/known-gaps/current-chunk are synchronized;
3. the archive remains explicitly non-normative;
4. PR CI is green.

A separate UX-03 implementation chantier starts only after this gate, from current main and with a new delivery branch/PR.
