# Current Chunk

Status: ACTIVE
Scope: documentation truth and modularization mission
Source of truth: this branch and its PR state
Implementation: documentation files under `docs/` plus top-level guides
Validation: documentation audit + standard CI
CI gate: PR CI

## Current work

Branch: `docs/documentation-truth-architecture`
Current PR: not opened until the documentation tree is internally consistent.
Objective: replace monolithic/overlapping active documentation with a modular architecture, revalidate current truth, and isolate history.

## Relevant documents

- [state/current-state.md](../state/current-state.md)
- [state/truth-matrix.md](../state/truth-matrix.md)
- [documentation-guide.md](../documentation-guide.md)
- [roadmap/master-plan.md](master-plan.md)

## Completion gate

No functional code changes. All active links resolve, old active documents are moved to archive, top-level guides are reduced to their intended roles, and standard typecheck/test/build/CI validation remains green.
