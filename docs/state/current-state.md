# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

The functional E2E-001 baseline is 9438bbedb2d44cf3f5f371144bcf72094955cd46. Deterministic browser CI is green and the target-PC real-CCP SSO/ESI smoke PASS was recorded on 2026-09-23.

The current UX-first program is closing the P0 market/ESI retrieval reliability gate. UX-01 technical implementation is merged; the target-PC market-order incident remains NOT ROOT-CAUSED.

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

CI-001 is **DONE / MERGED** on main at `7fc6fe7ca65454d0d29843bc0eace336b2da864c`.

Post-merge behavior is now intentionally split: PR changes run the PR certification surface, while pushes to `main` run the short Main Smoke surface. Full Repository Certification is scheduled/manual.

The single-active-branch/PR rule remains mandatory: one delivery branch at a time, and merged branches are not reused for new work.

## CI operator tooling status

Oclif is **planned / not implemented** as a future project CLI operator layer. It is intentionally not part of the active P0-B branch scope.

The intended separation is:
- GitHub Actions = CI and certification authority;
- gh = GitHub workflow/PR/run control;
- Oclif = optional project-facing operator commands and enforcement of the repository's delivery procedure.

Activation is deferred until P0 is closed, or until a separately approved CI-hardening need makes the operator layer materially useful. The implementation, if activated, gets its own branch and PR.

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

- Target-PC public market-order retrieval failure is reported but not root-caused.
- The P0-A audit found no concrete non-Operations production consumer that currently collapses a market acquisition failure into certifiable ordinary empty business state. The legacy `EsiService.fetchLiveOrders()` helper remains a latent quality-loss hazard with no production caller.
- P0-B deterministic browser coverage is certified on main: PR #66 merged at `c0ddc69ef424ed0cfd4de776758166c3ee8c1abe`; post-merge Main Smoke #7 is green. The proof verifies HTTP 429, Retry-After and ESI budget diagnostics without collapsing the market into a false empty state.
P0-C is now the active increment: a browser-visible JSON evidence export is being added so the affected PC can capture the repository-side market diagnostics in one reproducible bundle without exporting authentication tokens.
- Rate-limit-aware market scheduling is not yet exposed as a product-level operational signal.
- No coherent Real Portfolio vs Proposed Allocation split exists yet.
- No automatic ESI-derived performance history replaces the manual journal yet.
- No clear business Control Center exists yet.
- Cockpit remains too item-centric to serve as a decision-oriented synthesis.

## P0 closure status

Completed and certified on main:

- Global market synchronization now treats a market-quality `ERROR` as a failed item and preserves the error count instead of counting it as a successful sync.
- Public market-order error responses preserve HTTP/cache/ESI rate-limit metadata through the backend route.
- Browser Operations proof confirms active orders remain visible while a market `ERROR` is surfaced with HTTP 401 and ESI budget diagnostics.
- CI run `35862904773` and SDE run `35862904812` are green; PR #63 merged into main at `72c049042a3e3bd735117bac43c3dfe71827f79d`.

Remaining P0 closure work is limited to the real target-PC evidence bundle and formal incident classification as ROOT-CAUSED or EXTERNALLY BOUNDED. P0-A is audited and merged; P0-B is certified and merged; P0-C is active on the current delivery branch.

## Current chantier / sequencing

**Current product chantier: P0 market/ESI retrieval reliability closure.**

The P0-B branch `test/p0-market-429-retry-after` is historical and must not be reused. The current technical branch `feat/p0-target-pc-evidence` starts from `main` at `c0ddc69ef424ed0cfd4de776758166c3ee8c1abe` and contains the P0-C evidence export plus synchronized documentation.

UX-02 is DONE / MERGED. CI-001 is DONE / MERGED. Historical delivery branches have been reconciled to the current main head and are not active work.

P0-C is the active technical increment. UX-03 and all other deferred work remain blocked by the P0 closure gate.

## Reference paths

[CI Validation](../validation/ci.md) ·
[CI Baseline](../audits/ci-management-baseline-2026-09-23.md) ·
[CI Evidence Map](../validation/ci-evidence-map.md) ·
[CI Management Audit](../audits/ci-management-audit-2026-09-23.md) ·
[CI-001 Plan](../roadmap/ci-management-refactor.md) ·
[P0 Market Reliability Plan](p0-market-reliability.md) ·
[P0-C Target-PC Evidence](../validation/p0-c-target-pc-evidence.md) ·
[UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md) ·
[UX Program](../roadmap/ux-program.md) ·
[Master Plan](../roadmap/master-plan.md) ·
[Truth Matrix](truth-matrix.md) ·
[Known Gaps](known-gaps.md)
