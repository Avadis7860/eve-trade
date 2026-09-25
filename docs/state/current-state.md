# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

PR #83 (`feat(financial): recover canonical Financial Truth core`) was merged into `main` at `a2544d2f98f1b9e181dd2ecdd52191fc7680aec8`. Its stable integration anchor is the first parent `a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8`. The Financial Truth core is now part of `main`.

PR #84 completed the post-merge context synchronization, PR #93 completed UX-03 / TASK-01 contract rebase, and PR #94 completed the first repository-state closing pass. The current main tip before TASK-02 is `1799471409bc49782649c72d7a91756d046b044`. PR #95 completed the previous documentation cleanup for stale delivery references. The functional E2E-001 baseline was `9438bbedb2d44cf3f5f371144bcf72094955cd46`. Deterministic browser CI is green and the target-PC real-CCP SSO/ESI smoke PASS was recorded on 2026-09-23.

The UX-first program has closed the P0 market/ESI retrieval reliability gate. UX-01 is DONE / EXTERNALLY BOUNDED; the previously reported target-PC market-display symptom is resolved and the current application is functional. Financial Truth / FIN-002 is also integrated and accepted on main.

## Active PR context

PR #103 is the active UX-03 / TASK-03 delivery, based on current stable `main` at `0f822077a43a03ea17098e1b35e25f8374487888`.

The active branch is `ux-03/task-03-typed-portfolio-model`. TASK-03 is limited to extraction/reconstruction of the typed Portfolio contract from current `main`; the historical archive remains reference-only.

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

CI-001 is **DONE / MERGED** on main at `7fc6fe7ca65454d0d29843bc0eace336b2da864c`. Main Smoke had completed successfully on the preceding main baseline; the current main baseline for TASK-02 is `1799471409bc49782649c72d7a91756d046b044`.

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

The Agent Context Hardening delivery is closed through PR #84. UX-03 / TASK-01 is closed through PR #93. PR #94 completed the initial post-merge synchronization. PR #95 closes the remaining stale context references; no product implementation branch is active.

TASK-01 was documentation/contract-only and did not import archived UX-03 implementation or revive the historical financial implementation.

The stable navigation layer is `.eve-trade/context-map.json`; the checkout-aware operational state is `.eve-trade/current-work.json`; validation is `npm run test:context`. The hardening closes lifecycle, bootstrap, routing and stable-state drift identified by the audit.

## Current chantier / sequencing

**Previous delivery:** the Agent Context Hardening raw-commit anchor correction was completed through PR #81, with PR #84 performing its post-merge synchronization. Agent Context Hardening v2 / PR #79 and the shallow-anchor correction / PR #80 are merged on main. UX-03 branches/PRs #71 and #77 are closed without merge and their archive is reference-only.

Financial Truth semantic reconciliation is complete on main. UX-03 / TASK-01 is complete and its accepted contract is now part of main. The previous delivery was UX-03 / TASK-02 — Data Availability & Derivation Matrix revalidation, completed through PR #96. Main Post-Merge Smoke #23 passed on `af725a6`. The resulting matrix is current-main aligned, preserves FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY boundaries, and introduces no product implementation or new ESI source. Character Assets remains the explicit `NEW SOURCE` boundary for authoritative inventory quantity/location.

The active product implementation contract work is UX-03 / TASK-03 (issue #87) on branch `ux-03/task-03-typed-portfolio-model`, PR #103, based on `0f822077a43a03ea17098e1b35e25f8374487888`. The task is restricted to Portfolio model extraction and contract validation; product/UI implementation remains outside this task.

UX-02 is DONE / MERGED. CI-001 is DONE / MERGED. UX-01/P0 is DONE / EXTERNALLY BOUNDED.

Public Readiness remains a separate maintenance track; it is not merged into this chantier.

References: [Agent Context](../operations/agent-context.md) · [Financial Truth Reconciliation](../roadmap/financial-truth-reconciliation.md)

## Reference paths

[CI Validation](../validation/ci.md) ·
[CI Baseline](../audits/ci-management-baseline-2026-09-23.md) ·
[CI Evidence Map](../validation/ci-evidence-map.md) ·
[CI Management Audit](../audits/ci-management-audit-2026-09-23.md) ·
[CI-001 Plan](../roadmap/ci-management-refactor.md) ·
[P0 Market Reliability Plan](p0-market-reliability.md) ·
[Public Readiness](../roadmap/public-readiness.md) ·
[P0-C Target-PC Evidence](../validation/p0-c-target-pc-evidence.md) ·
[UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md) ·
[UX Program](../roadmap/ux-program.md) ·
[Master Plan](../roadmap/master-plan.md) ·
[Truth Matrix](truth-matrix.md) ·
[Known Gaps](known-gaps.md)
