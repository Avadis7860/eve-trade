# Current Chunk

Status: ACTIVE
Scope: Selective Financial Truth recovery from archived UX-03
Branch: chore/financial-truth-archive-recovery
Base: main @ a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8
PR: #82 (Draft)
Archive: archive/ux-03-allocation-contract-2026-09-24 @ 75df2e8f77d8ccc0cd5a2a631661902d1b54fab6

## Objective

Recover only still-valid Financial Truth contracts, primitives and invariants from the UX-03 archive, rebuilding them against the current main architecture.

## Active delivery sequence

1. Freeze the current main and archive evidence.
2. Reconcile economic scope, provenance, owner/observer dimensions and market-order semantics.
3. Recover position-segment / acquisition-lot / disposal-allocation contracts.
4. Rebuild the canonical position ledger against current types and current source boundaries.
5. Rebase realized financial outcome calculation onto the ledger without collapsing UNKNOWN/PARTIAL/ERROR/UNAVAILABLE into numeric zero.
6. Recover and rewrite historical financial invariants.
7. Certify unit/domain/build and relevant regression paths through the current CI.
8. Synchronize current contracts, validation, state, roadmap and known-gaps.
9. Merge only after the final certification gate is green, then execute Main Smoke.

## Scope exclusions

- No merge or bulk cherry-pick from the archive.
- No UX-03 Portfolio UI resurrection.
- No Portfolio aggregation recovery in this increment.
- No Fleet restoration or Fleet-model migration.
- No unrelated ESI/OAuth changes.
- No CI / Agent Context redesign.
- No PI/Industry implementation.

## Recovery rule

The archive is historical evidence only. Current main remains the integration authority. Every recovered element must satisfy:
**current business need -> current contract -> invariant -> historical evidence -> adapted implementation -> regression proof**.

## Completion gate

The chantier is complete only when the selected financial primitives are implemented and tested against current main, CI certification is green, documentation states the reconciled financial boundary, and post-merge Main Smoke is green.
