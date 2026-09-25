# Backlog

Status: CURRENT
Scope: durable open work only
Source of truth: revalidated code, current state and GitHub Issues

Les GitHub Issues sont la source opérationnelle des chantiers. Ce document ne reprend pas leurs plans d'exécution détaillés.

## Product / UX program

The authoritative product sequence is [UX-First Trading Terminal Program](ux-program.md).

### UX-03 — Allocation / Portefeuille

Preparatory contract work is complete in Issues #85–#87. The next review chantier is **Issue #88 — TASK-04 / Portfolio Aggregation**.

See the GitHub Issues for the living work plan and current execution state.

### FIN-002 — Performance & Trade Analytics

**Issue #74 — OPEN / DEFERRED**

The canonical Financial Truth boundary is accepted. Remaining work concerns analytics semantics and reconciliation. This issue remains separate from the UX-03 review sequence and becomes a direct prerequisite before UX-04 is treated as financially certified.

### UX-04 → UX-07

- UX-04 — Performance / Journal → Issue #120
- UX-05 — Control Center / Paramètres → Issue #121
- UX-06 — Cockpit → Issue #122
- UX-07 — responsive/accessibility/interaction hardening → Issue #123

Each Issue owns its detailed execution plan, acceptance criteria and progression.

## Deferred technical work

- PST-001 → Issue #114
- UI-001 → Issue #115
- E2E-002 → Issue #116
- UI-002 → Issue #117
- PERF-001 → Issue #118
- TYPE-001 → Issue #119

These remain strategically deferred; their Issues own the detailed plans.

## Engine / operations follow-ups

- PRED-001 → Issue #98
- DATA-002 → Issue #99
- PRED-002 → Issue #100
- ORD-002 → Issue #101
- CAL-001 → Issue #102

These Issues are the operational source for those chantiers.

## Public readiness

The public-readiness track is summarized in [public-readiness.md](public-readiness.md). Operational plans live in Issues #106–#111 and the parent tracking Issue #124.

## CI follow-ups

- CI-002 → Issue #112
- CI-OPS-001 → Issue #113

The current CI architecture remains documented in [CI-001 summary](ci-management-refactor.md); CI-001's detailed execution record is archived.

## Historical / closed material

The closed P0 execution record is archived in [p0-market-reliability.md](../archive/roadmaps/p0-market-reliability.md).

Historical financial reconciliation remains in [financial-truth-reconciliation.md](financial-truth-reconciliation.md) and is not an operational work plan.

## Rule

Issues and Pull Requests are the operational source for active chantiers.

Markdown roadmap/backlog content may define durable strategy, dependencies, contracts, and historical references, but must not become a second operational plan.

No document in the active roadmap should require a post-merge “synchronization PR” solely because an Issue or PR changed status.
