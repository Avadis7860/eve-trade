# Master Plan

Status: CURRENT
Scope: strategic sequencing only
Source of truth: current code/tests/CI and state documents
Implementation: tracked roadmaps and code
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The recent stabilization sequence #37–#42 established corporation-aware ownership, canonical OrderId, corporation ESI acquisition, explicit ESI collection state, corporation-order normalization and multi-character provenance.

Stable foundations are listed in [stable-domains](../state/stable-domains.md). Do not reopen them without a demonstrable regression.

## Ordered roadmap

| ID | Goal | Dependencies | Risk | Validation |
|---|---|---|---|---|
| DOC-001 | Reconstruct modular documentation governance | current mission | stale truth if incomplete | docs/link audit + CI |
| E2E-001 | Establish reproducible local OAuth/browser gate | stable auth/ESI | environment-sensitive auth | browser smoke + security/API |
| PST-001 | Decompose IndexedDB implementation without semantic drift | persistence contract | migration/data-loss risk | persistence + full regression |
| UI-001 | Expose corporation trading scope cleanly in UI | trading contracts stable | UI may bypass ownership semantics | typecheck + targeted UI tests |
| E2E-002 | Add critical browser workflows | E2E-001, UI-001, PST-001 as needed | false confidence from partial flows | browser suite + CI |
| UI-002 | Decompose oversized frontend components | stable domain contracts | behavior drift | typecheck + regression + E2E |
| UX-001 | Accessibility/responsive/interaction hardening | UI-002 where relevant | broad UI surface | E2E + targeted checks |
| PERF-001 | Measure and optimize initial load/runtime cost | UI structure stable | regressions hidden by micro-optimizations | build + performance evidence |
| TYPE-001 | Reduce remaining legacy typing/facades where beneficial | preceding refactors | churn without user value | typecheck + regression |

The exact order may be recomputed after each completed chantier. The table is orchestration, not a promise that every item remains unchanged.

## Definition of Done for a future chantier

Goal met, scope contained, affected contracts/invariants updated, regression surface green, CI green, and current documentation synchronized in the same PR when normative behavior changes.
