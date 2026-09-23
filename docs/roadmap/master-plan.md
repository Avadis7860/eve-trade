# Master Plan

Status: CURRENT
Scope: strategic sequencing only
Source of truth: current code/tests/CI and state documents
Implementation: tracked roadmaps and code
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The documentation reconstruction (DOC-001) is complete and merged. PR #45 prepared the E2E-001 bootstrap documentation. The stabilization sequence #37–#42 remains the functional foundation. Current `main` is `a31979c6c76ba93cc19a7437894f3935e69a01c7` and its post-merge CI is green.

Stable foundations are listed in [stable-domains](../state/stable-domains.md). Do not reopen them without a demonstrable regression.

## Ordered roadmap

| ID | Status | Goal | Dependencies | Risk | Validation |
|---|---|---|---|---|---|
| DOC-001 | DONE | Reconstruct modular documentation governance | current mission | stale truth if incomplete | docs/link audit + CI |
| E2E-001 | READY FOR LOCAL ACCEPTANCE | Establish reproducible local OAuth/browser gate, deterministic CI E2E coverage, and a separately executed real-CCP smoke path | stable auth/ESI | environment-sensitive auth and callback integration | browser E2E + security/API + local CCP smoke |
| PST-001 | PLANNED | Decompose IndexedDB implementation without semantic drift | persistence contract + E2E-001 safety net | migration/data-loss risk | persistence + full regression |
| UI-001 | PLANNED | Expose corporation trading scope cleanly in UI | trading contracts stable | UI may bypass ownership semantics | typecheck + targeted UI tests |
| E2E-002 | PLANNED | Add critical browser workflows beyond authentication | E2E-001, UI-001, PST-001 as needed | false confidence from partial flows | browser suite + CI |
| UI-002 | PLANNED | Decompose oversized frontend components | stable domain contracts | behavior drift | typecheck + regression + E2E |
| UX-001 | PLANNED | Accessibility/responsive/interaction hardening | UI-002 where relevant | broad UI surface | E2E + targeted checks |
| PERF-001 | PLANNED | Measure and optimize initial load/runtime cost | UI structure stable | hidden regressions | build + performance evidence |
| TYPE-001 | PLANNED | Reduce remaining legacy typing/facades where beneficial | preceding refactors | churn without user value | typecheck + regression |

The exact order may be recomputed after each completed chantier. This table is orchestration, not a promise that every item remains unchanged.

## E2E-001 entry criteria

E2E-001 has now met its deterministic implementation and CI entry criteria on PR #46. The remaining acceptance step is execution on the target PC against real CCP SSO/ESI.

The test model has two complementary layers:

1. A deterministic CI/browser layer using the real eve-trade frontend/backend/session path, with controlled OAuth/ESI boundaries so CI never depends on a real CCP account.
2. A local real-CCP smoke layer using a dedicated disposable CCP test account. Human interaction is allowed for the CCP login/consent step; credentials must remain local and must never enter Git history, fixtures, logs or CI secrets unless a later task explicitly requires managed secret storage.

The real-CCP smoke layer is an integration proof, not a CI prerequisite.

## Definition of Done

Goal met, scope contained, affected contracts/invariants updated, regression surface green, CI green, current documentation synchronized in the same PR when normative behavior changes, and the target-PC real-CCP smoke executed and recorded.
