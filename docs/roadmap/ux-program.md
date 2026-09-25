# UX-First Trading Terminal Program

Status: CURRENT
Owner: product / UI-UX
Date established: 2026-09-23
Source: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)

## Purpose

Reframe EVE Trade around the user's actual trading workflow before starting unrelated technical work.

The program is an information-architecture, data-truth and workflow contract program, not a visual redesign-only exercise.

## Hard sequencing rule

No unrelated chantier starts before the UX baseline/contract gate is complete.

Allowed supporting work:
- market/ESI reliability and observability required to establish truth;
- security/regression work;
- documentation required to specify accepted UX contracts.

## Workstream order

| Workstream | Status | Operational owner |
|---|---|---|
| UX-00 — Product model and information architecture | DONE | historical gate; see completed records |
| UX-01 — Market truth / retrieval observability | DONE / EXTERNALLY BOUNDED | historical gate; current state/validation docs |
| UX-02 — Operations / Mes Ordres | DONE / MERGED | historical delivery; PR records |
| UX-03 — Allocation / Portefeuille | P1 / CONTRACT ACCEPTED | [Issues #85–#92](https://github.com/Avadis7860/eve-trade/issues?q=is%3Aissue+label%3Aux-03) |
| UX-04 — Performance / Journal | P1 / NOT ACTIVE | Issue #120 |
| UX-05 — Control Center / Paramètres | P1 / NOT ACTIVE | Issue #121 |
| UX-06 — Cockpit | P2 / NOT ACTIVE | Issue #122 |
| UX-07 — Interaction / responsive / accessibility | P2 / NOT ACTIVE | Issue #123 |

Les détails d'exécution, critères propres au chantier, décisions intermédiaires et preuves de progression sont portés par les Issues et leurs PRs, pas par ce document.

## Shared contracts required before implementation

Every surface must define:
- primary user goal;
- primary decision;
- primary data source;
- data health state;
- empty state;
- stale state;
- partial state;
- error state;
- loading state;
- refresh behavior;
- action semantics;
- link/transition destination;
- validation scenarios.

## Durable product rules

- Discovery, Operations, Allocation, Performance, Cockpit and Control Center have distinct responsibilities.
- Real Portfolio and Proposed Allocation remain separate concepts.
- Projected values are never presented as realized values.
- Score, ROI, projected profit and realized financial result are distinct metrics.
- Cached, stale, partial, error and unknown states remain explicit.
- A selected item is navigation context, not an implicit portfolio universe.
- Any new data source must be justified against existing authoritative sources.

## Program exit criteria

The UX-first program is complete only when:
1. target information architecture is documented;
2. P0 market retrieval is observable and reproducible;
3. Operations, Allocation, Performance and Parameters contracts are approved;
4. implementation-ready acceptance scenarios exist;
5. roadmap/backlog and their GitHub Issue references are synchronized;
6. the Cockpit contract is defined against the resulting surfaces.

This document records the program and its durable gates only. The living execution plan of each workstream belongs to its GitHub Issue.
