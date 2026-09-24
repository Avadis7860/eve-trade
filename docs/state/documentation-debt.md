# Documentation Debt

Status: CURRENT
Scope: documentation quality and context cost
Source of truth: documentation inventory at baseline

## Findings

The previous structure mixed architecture, contracts, invariants, validation, audits and roadmap in large Markdown files. Several files exceeded 300 lines and overlapped in normative content.

## Resolution

This mission creates separate state, architecture, domain, contract, invariant, validation, roadmap, operations, decision and archive surfaces, with indexes and explicit sources of truth.

## Current governance

The active documentation set is synchronized to the current public repository state by the public-readiness/state-sync chantier. Future contract changes must update code, tests and the affected contract/invariant/validation documents together. Old audits remain historical only.

The main remaining documentation risk is now keeping public-facing claims, release state and security posture synchronized as the project evolves.
