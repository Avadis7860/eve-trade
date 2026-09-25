# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

Stable `main` at the start of CONTEXT-005 is `96797a2566496f097ddc6d075786addb8e7ce78d`, the merge commit of PR #105. That delivery exposed the repository-state defect: `.eve-trade/current-work.json` survived on `main` as an ACTIVE chantier.

The persistent stable delivery boundary is now `.eve-trade/stable-context.json`. The active checkout manifest is `.eve-trade/current-work.json`, generated only in an active checkout and ignored by Git.

The UX-first program has closed the P0 market/ESI retrieval reliability gate. UX-01 is DONE / EXTERNALLY BOUNDED; the previously reported target-PC market-display symptom is resolved and the current application is functional. The Financial Truth semantic boundary (FIN-002-RECON) is integrated and accepted on main. FIN-002 Performance & Trade Analytics remains OPEN / DEFERRED as a separate follow-up.

## Active PR context

CONTEXT-005 is the active delivery chantier on branch `chore/context-005-current-work-lifecycle-rework`, PR #129, based on `main` `96797a2566496f097ddc6d075786addb8e7ce78d`.

The active `current-work.json` is no longer persisted in Git. PR certification generates it from the GitHub event before running `npm run test:context`. The persistent `stable-context.json` records the delivery declaration that the PR is preparing to integrate; its integration anchor is the PR base SHA.

PR #128 and PR #127 remain historical evidence only. No post-merge cleanup PR is part of the target architecture.

## CI / delivery state

The current CI is **operationally restructured and certification-safe** after CI-001. Its post-merge Main Smoke and scheduled/manual Full Certification are separate from the PR gate.

CI-001 merged on main at `7fc6fe7ca65454d0d29843bc0eace336b2da864c`.

Reference CI-001 certification run: `35856208503`.

Observed implementation evidence:

- \`validate\` ≈ 104 s;
- \`browser-e2e\` ≈ 166 s;
- browser waits for \`validate\`, producing ≈ 276 s of workflow path on that run;
- the main test script contains about 37 sequential commands;
- several specialized gates re-execute tests already present in the global test script;
- current concurrency cancels obsolete runs on one workflow reference, but does not coordinate distinct PRs.

The historical action data also shows high churn on some branches, with many cancelled runs. The study concludes that this is a combined **topology + certification taxonomy + PR governance** problem rather than a single slow-test problem.

A dedicated study is recorded in [CI management audit](../audits/ci-management-audit-2026-09-23.md), with implementation plan [CI-001](../roadmap/ci-management-refactor.md) and [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md).

### Current CI management decision

CI-001 is **DONE / MERGED** on main at `7fc6fe7ca65454d0d29843bc0eace336b2da864c`. Main Smoke #24 had completed successfully on the preceding main baseline; the current merged main baseline after TASK-03 is `db37afca938b9d106a2e442e24d777b8c98e9eac`.

Post-merge behavior is now intentionally split: PR changes run the PR certification surface, while pushes to `main` run the short Main Smoke surface. Full Repository Certification is scheduled/manual.

The single-active-branch/PR rule remains mandatory: one delivery branch at a time, and merged branches are not reused for new work.

## CI operator tooling status

Oclif is **planned / not implemented** as a future project CLI operator layer. It is not part of any active product branch.

The intended separation is:
- GitHub Actions = CI and certification authority;
- gh = GitHub workflow/PR/run control;
- Oclif = optional project-facing operator commands and enforcement of the repository's delivery procedure.

Activation is deferred until the operator layer is justified by repeated procedural friction. Any implementation gets its own branch and PR.

## Stable foundations

- Canonical catalog protected by version/count/checksum manifest.
- Canonical CCP SDE-backed universe graph protected by manifest, provenance, checksum and cardinality.
- Shared backend ESI transport with principal-aware gateway behavior, ETag/304 and rate-limit metadata.
- Corporation ESI authorized through the authenticated character; no synthetic corporation credential.
- Canonical string OrderId, with unsafe numeric values rejected.
- Explicit economic ownership separated from observing principal.
- Explicit ESI collection states.
- RealizedFinancialOutcomeEngine is the accounting source of truth.
- IndexedDB version 5 with 11 object stores.
- Market outcome scheduler is started by App.tsx and stopped on unmount.
- Modular documentation architecture is the active governance model.

## Product reality

The current engine/domain layers are ahead of the UI information architecture.

- Global discovery remains the principal discovery surface.
- Mes Ordres / Operations is implemented and merged with a certified keep / adjust / relocate / cancel decision loop.
- Portfolio allocation supports concentration by item type/group, but the current React opportunity input is derived from the selected item, so the UI cannot express the intended cross-item diversified allocation.
- Journal remains manual despite ESI-derived transactions, order history and wallet journal already being available.
- Parameter UI contains real controls, but business-critical decision thresholds are not surfaced with the same priority and some exposed flags do not have a demonstrated current consumer.
- UI now exposes market health diagnostics with LIVE, CACHE, STALE, PARTIAL, UNKNOWN and ERROR semantics.

## Active product gaps

- The legacy `EsiService.fetchLiveOrders()` helper remains a latent quality-loss hazard because it discards the quality envelope; no production caller is currently known.
- Rate-limit-aware market scheduling is not yet exposed as a product-level operational signal.
- No coherent Real Portfolio vs Proposed Allocation split exists yet.
- No automatic ESI-derived performance history replaces the manual journal yet.
- No clear business Control Center exists yet.
- Cockpit remains too item-centric to serve as a decision-oriented synthesis.
- Public repository security/release posture still needs the maintenance work recorded in [Public Readiness](../roadmap/public-readiness.md).

## P0 closure status

**DONE — EXTERNALLY BOUNDED.**

Certified and merged:
- global market synchronization failure accounting;
- HTTP/cache/ESI/Retry-After propagation;
- browser diagnostic proof;
- P0-A caller audit (PR #65);
- P0-B deterministic 429 / Retry-After proof (PR #66);
- P0-C evidence export (PR #67);
- post-merge documentation/state synchronization (PR #68).

The previously reported target-PC market-display symptom is resolved. The application is currently functional, and the operator confirmed that insufficient available data explained the symptom. No persistent application defect is currently identified. P0 no longer blocks product work.

## Agent context hardening

The previous Agent Context Hardening line is being reworked by CONTEXT-005 (#126 / PR #129).

The architecture now separates:
- stable navigation: `.eve-trade/context-map.json`;
- persistent stable delivery context: `.eve-trade/stable-context.json`;
- ephemeral active-work context: `.eve-trade/current-work.json`;
- deterministic certification: `scripts/context-integrity.mjs`.

The objective is to make an active chantier impossible to persist accidentally on `main`, without mirroring GitHub Draft / Ready for Review into a repository state machine.

## Current chantier / sequencing

**Active delivery:** CONTEXT-005 — Reconcevoir le cycle de vie et la certification du manifeste `current-work`.

Issue: #126  
PR: #129  
Branch: `chore/context-005-current-work-lifecycle-rework`  
Base: `main` @ `96797a2566496f097ddc6d075786addb8e7ce78d`

Current phase: **B/C — active/stable schema separation and certification rebuild**.

No product, Financial Truth, ESI, or CI-002 implementation is part of this chantier.

References: [Agent Context](../operations/agent-context.md) · [CONTEXT-005](https://github.com/Avadis7860/eve-trade/issues/126)
