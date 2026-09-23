# Master Plan

Status: CURRENT
Scope: strategic sequencing only
Source of truth: current code/tests/CI and state documents
Implementation: tracked roadmaps and code
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The documentation reconstruction (DOC-001) is complete and merged. PR #45 prepared the E2E-001 bootstrap documentation. The stabilization sequence #37–#42 remains the functional foundation. PR #46 established the functional E2E-001 baseline on `main` at `9438bbedb2d44cf3f5f371144bcf72094955cd46`; deterministic CI and the target-PC real-CCP acceptance are complete.

Stable foundations are listed in [stable-domains](../state/stable-domains.md). Do not reopen them without a demonstrable regression.

## Ordered roadmap

| ID | Status | Goal | Dependencies | Risk | Validation |
|---|---|---|---|---|---|
| DOC-001 | DONE | Reconstruct modular documentation governance | current mission | stale truth if incomplete | docs/link audit + CI |
| E2E-001 | DONE | Establish reproducible local OAuth/browser gate, deterministic CI E2E coverage, and a separately executed real-CCP smoke path | stable auth/ESI | environment-sensitive auth and callback integration | browser E2E + security/API + local CCP smoke |
| PST-001 | PLANNED | Decompose IndexedDB implementation without semantic drift | persistence contract + E2E-001 safety net | migration/data-loss risk | persistence + full regression |
| UI-001 | PLANNED | Expose corporation trading scope cleanly in UI | trading contracts stable | UI may bypass ownership semantics | typecheck + targeted UI tests |
| E2E-002 | PLANNED | Add critical browser workflows beyond authentication | E2E-001, UI-001, PST-001 as needed | false confidence from partial flows | browser suite + CI |
| UI-002 | PLANNED | Decompose oversized frontend components | stable domain contracts | behavior drift | typecheck + regression + E2E |
| UX-001 | PLANNED | Accessibility/responsive/interaction hardening | UI-002 where relevant | broad UI surface | E2E + targeted checks |
| PERF-001 | PLANNED | Measure and optimize initial load/runtime cost | UI structure stable | hidden regressions | build + performance evidence |
| TYPE-001 | PLANNED | Reduce remaining legacy typing/facades where beneficial | preceding refactors | churn without user value | typecheck + regression |

The exact order may be recomputed after each completed chantier. This table is orchestration, not a promise that every item remains unchanged.

## E2E-001 completion

E2E-001 has met all entry and completion criteria. PR #46 is merged, deterministic browser/regression CI is green, and the target-PC real-CCP SSO/ESI smoke was executed successfully on 2026-09-23.

The test model has two complementary layers:

1. A deterministic CI/browser layer using the real eve-trade frontend/backend/session path, with controlled OAuth/ESI boundaries so CI never depends on a real CCP account.
2. A local real-CCP smoke layer using a dedicated disposable CCP test account. Human interaction is allowed for the CCP login/consent step; credentials must remain local and must never enter Git history, fixtures, logs or CI secrets unless a later task explicitly requires managed secret storage.

The real-CCP smoke layer remains an integration proof and is now recorded as PASS; it is not a CI prerequisite.

## Definition of Done

E2E-001 meets the definition of done: scope contained, affected contracts/invariants documented, regression surface green, CI green, documentation synchronized, merged to `main`, and target-PC real-CCP smoke executed and recorded as PASS.
