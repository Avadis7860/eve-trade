# Public Readiness

Status: CURRENT — MAINTENANCE TRACK
Scope: public repository credibility and portfolio readiness
Owner: project maintainer
Audit: [Public Readiness Audit](../audits/public-readiness-audit-2026-09-24.md)

## Purpose

Prepare EVE Trade for public presentation without confusing "public repository" with "finished product".

This track protects the quality of the first public impression while the product roadmap continues independently.

## Work items

| ID | Status | Scope | Exit evidence |
|---|---|---|---|
| PUB-001 | DONE | README, public status, CI badge, capabilities and known limits | accurate README on main |
| PUB-002 | HIGH PRIORITY | SECURITY.md + GitHub security settings review + SAST decision | published policy + settings evidence |
| PUB-003 | DECISION REQUIRED | source-code license model | explicit license decision/file |
| PUB-004 | PLANNED | release/tag/version provenance | validated showcase release |
| PUB-005 | PLANNED | screenshots / deterministic showcase path | visitor can understand core workflow without private credentials |
| PUB-006 | PLANNED | dependency maintenance and vulnerability review | recurring maintenance path |
| PUB-007 | DONE | active-document synchronization | no stale current-state claims |
| PUB-008 | PLANNED | legacy metadata review | metadata intentionally retained or removed with proof |

## Current disposition

PUB-001 and PUB-007 are completed by this documentation synchronization branch. PUB-002 and PUB-003 remain explicit gates before portfolio publication.

## Public showcase gate

The repository should not be presented as a finished portfolio artifact until PUB-001, PUB-002, PUB-003 and PUB-007 are resolved.

A showcase release additionally requires PUB-004 and a reproducible product walkthrough.

## Relationship to the product roadmap

Public Readiness is a maintenance track, not a replacement for UX delivery.

After the current documentation/state synchronization:

1. UX-03 — Allocation / Portefeuille.
2. UX-04 — Performance / Journal.
3. UX-05 — Control Center / Paramètres.
4. UX-06 — Cockpit.
5. UX-07 — responsive/accessibility/interaction hardening.

Critical security or regression work may interrupt this order when supported by evidence.

## Delivery discipline

One active delivery branch and one active PR at a time.

Public-readiness code/config changes must use dedicated branches and must not be mixed into unrelated UX feature PRs.
