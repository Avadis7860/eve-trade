# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

The stable repository state is determined by the integrated tree on `main`, its certified tests and its CI proofs.

PR #105 historically exposed a repository-state defect because chantier metadata survived a merge as active work. The durable lesson is that delivery lifecycle belongs to GitHub, while repository documents describe only stable software knowledge.

The UX-first program has closed the P0 market/ESI retrieval reliability gate. UX-01 is DONE / EXTERNALLY BOUNDED; the previously reported target-PC market-display symptom is resolved and the current application is functional. The Financial Truth semantic boundary (FIN-002-RECON) is integrated and accepted on main. FIN-002 Performance & Trade Analytics remains an open separate follow-up.


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

The PR certification workflow is the deep pre-merge proof. Main Post-Merge Smoke is the short independent proof on `main`. Full Repository Certification remains scheduled/manual.

Delivery administration is handled by GitHub Issues and Pull Requests; repository state documentation does not mirror active PR or branch metadata.


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

The repository no longer persists or generates a current-work delivery manifest. Stable navigation is provided by `.eve-trade/context-map.json`; active delivery lifecycle is owned by GitHub Issues and Pull Requests; Git represents repository state; GitHub Actions provides certification.

`scripts/context-integrity.mjs` validates the stable navigation model and the Git checkout invariants required by the active and stable CI modes.

The durable objective is to keep delivery administration outside versioned repository state, so normal merges never require a documentation or manifest cleanup step.

## Delivery sequencing

The active technical chantier is managed in GitHub. Versioned roadmaps describe durable product and architecture sequencing only.

References: [Agent Context](../operations/agent-context.md) · [UX program](../roadmap/ux-program.md) · [master plan](../roadmap/master-plan.md)
