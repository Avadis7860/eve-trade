# Current Chunk

Status: ACTIVE
Scope: UX-03 / TASK-03 — Relecture et extraction du modèle typé Portfolio
Branch: ux-03/task-03-typed-portfolio-model
Base: main @ 0f822077a43a03ea17098e1b35e25f8374487888
PR: #103

## Delivery status

The active chantier follows method C: re-extract a new Portfolio model from current `main`. The historical `src/types/portfolio.ts` remains reference-only.

## Objective

- complete field-by-field extraction from the archive;
- define the minimal typed Portfolio contract from current-main authorities;
- keep Real Portfolio and Proposed Allocation distinct;
- preserve provenance, accounting scope, owner/observer/issuer, freshness, health and coverage;
- preserve explicit UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE / STALE semantics.

## Scope guard

No new ESI source.
No Character Assets integration.
No UI implementation.
No new Financial Truth / FIFO implementation.
No wholesale archive copy or cherry-pick.

## Exit gate

- extraction matrix complete;
- new Portfolio type contract compiles;
- focused type-contract tests pass;
- roadmap/state/context metadata synchronized;
- CI certification green.

## Next step after this chunk

A separate implementation task may consume the accepted Portfolio contract only after TASK-03 is merged and the one-chanchier delivery rule opens the next branch/PR.
