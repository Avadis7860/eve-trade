# Current Chunk

Status: CERTIFIED / READY FOR MERGE
Scope: Selective Financial Truth recovery from archived UX-03
Branch: chore/financial-truth-archive-recovery
Base: main @ a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8
PR: #82 (certified)
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
9. Certification complete: CI Foundation & Regression Gate #1255 / head 3f3b10e2b4582a2feb063ae1869ae0b6299d08a9; SDE Truth Gate #1016; all required lanes, Unit/Domain, Server/API/ESI, Build, Static, Operations E2E, Auth E2E, required-gate and observability: SUCCESS.
10. Merge PR #82, then execute Main Smoke on the new main SHA.

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

## Certification evidence

CI Foundation & Regression Gate #1255 / head 3f3b10e2b4582a2feb063ae1869ae0b6299d08a9; SDE Truth Gate #1016; all required lanes, Unit/Domain, Server/API/ESI, Build, Static, Operations E2E, Auth E2E, required-gate and observability: SUCCESS.

The branch is ready for merge. Post-merge Main Smoke remains a separate final proof on the resulting main SHA.
