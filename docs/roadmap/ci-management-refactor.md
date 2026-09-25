# CI-001 — Refonte du système CI, validation et gouvernance

Status: HISTORICAL SUMMARY
Scope: durable CI architecture and lessons
Execution source: GitHub Issues / Pull Requests
Current validation: [CI Validation](../validation/ci.md)
Historical execution: [archived CI-001 record](../archive/roadmaps/ci-management-refactor.md)

## Durable outcome

CI-001 established the current certification model:
- PR certification with a stable `CI / required-gate`;
- specialized static, domain, server, build and browser lanes;
- separate Main Smoke after merge;
- separate scheduled/manual Full Repository Certification;
- conservative change-scope routing;
- immutable action references and explicit read-only permissions;
- CI observability;
- one active delivery branch / PR for a chantier.

The detailed CI-001 phase sequence is historical. It is preserved in the archive and is not an active work plan.

## Current follow-ups

Remaining CI changes must use dedicated GitHub Issues and their own branch/PR. They must not reopen or extend the completed CI-001 execution plan.

Current examples include:
- CI-002 — Draft vs Ready routing;
- CI-OPS-001 — optional operator CLI;
- administrative verification of `main` rulesets/protection.

## Governance

GitHub Issue = active CI work plan.
GitHub PR = implementation and certification.
This roadmap document contains durable CI architecture and sequencing constraints only.
