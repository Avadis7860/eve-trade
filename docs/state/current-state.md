# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

The functional E2E-001 baseline is 9438bbedb2d44cf3f5f371144bcf72094955cd46. Deterministic browser CI is green and the target-PC real-CCP SSO/ESI smoke PASS was recorded on 2026-09-23.

The current UX-first program is now in UX-02 Operations implementation. UX-01 is technically implemented; its target-PC market-order incident remains NOT ROOT-CAUSED.

## CI / delivery state

The current CI is **functionally valid but operationally inefficient**.

Reference main:
\`d7f245ec47a8746306792ce6017496f9123c23d6\`

Reference successful CI run:
\`35826687206\`

Observed baseline:

- \`validate\` ≈ 104 s;
- \`browser-e2e\` ≈ 166 s;
- browser waits for \`validate\`, producing ≈ 276 s of workflow path on that run;
- the main test script contains about 37 sequential commands;
- several specialized gates re-execute tests already present in the global test script;
- current concurrency cancels obsolete runs on one workflow reference, but does not coordinate distinct PRs.

The historical action data also shows high churn on some branches, with many cancelled runs. The study concludes that this is a combined **topology + certification taxonomy + PR governance** problem rather than a single slow-test problem.

A dedicated study is recorded in [CI management audit](../audits/ci-management-audit-2026-09-23.md), with implementation plan [CI-001](../roadmap/ci-management-refactor.md) and [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md).

### Current CI management decision

CI-001 is **ACTIVE — CI-001H** and remains the project-wide CI priority.

CI-001A/B froze the baseline/evidence map; CI-001C hardened workflow security/reproducibility; CI-001D split the validation topology; CI-001E formalized canonical test ownership; CI-001F isolated browser Auth/Operations jobs; CI-001G established and certified scope routing plus `CI / required-gate`; CI-001H now separates Main/Full and recovery.

During CI-001E:

- the current \`ci.yml\` remains the certification mechanism;
- the current SDE Truth Gate remains authoritative for SDE-sensitive changes;
- no required check name should be changed without first verifying main branch protection;
- the single active branch/PR rule remains mandatory; a new PR must not be opened solely to obtain a new CI signal.

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

- Global discovery is useful and remains the principal discovery surface.
- Mes Ordres has entered UX-02 implementation: it now has an operational KPI/order surface and a focused order-detail path; character synchronization still owns acquisition while Performance remains a separate surface.
- Portfolio allocation supports concentration by item type/group, but the current React opportunity input is derived from the selected item, so the UI cannot express the intended cross-item diversified allocation.
- Journal remains manual despite ESI-derived transactions, order history and wallet journal already being available.
- Parameter UI contains real controls, but business-critical decision thresholds are not surfaced with the same priority and some exposed flags do not have a demonstrated current consumer.
- UI must become explicit about data health: LIVE, CACHE, STALE, PARTIAL, UNKNOWN, ERROR.

## Active product gaps

- Target-PC public market-order retrieval failure is reported but not root-caused.
- Market acquisition failures can be collapsed into apparent empty business state by silent error handling in some non-Operations paths.
- Operations is partially implemented; the remaining gate is end-to-end validation of keep / adjust / relocate / cancel decisions with explicit data-health states.
- No coherent Real Portfolio vs Proposed Allocation split exists yet.
- No automatic ESI-derived performance history replaces the manual journal yet.
- No clear business Control Center exists yet.
- Cockpit remains too item-centric to serve as a decision-oriented synthesis.

## Current chantier / sequencing

UX-02 is paused while CI-001 is the active infrastructure chantier.

UX-01 is technically implemented and merged. Its target-PC market-order incident remains NOT ROOT-CAUSED pending capture of the required PC-side evidence.

CI-001 is the active cross-cutting infrastructure chantier. CI-001A/B is baselined, CI-001C is completed, CI-001D is proven on two green runs, CI-001E/F are implemented, CI-001G is certified on head `bc2ff6c24a6b4b419311b287ddd0b206489093c3`, and CI-001H is the current execution slice: Main/Full separation and recovery. The active PR/branch remains the only CI-001 delivery surface.

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 remain deferred until the UX sequencing gate is passed unless their dependency is explicitly reclassified.

## Reference paths

[CI Validation](../validation/ci.md) ·
[CI Baseline](../audits/ci-management-baseline-2026-09-23.md) ·
[CI Evidence Map](../validation/ci-evidence-map.md) ·
[CI Management Audit](../audits/ci-management-audit-2026-09-23.md) ·
[CI-001 Plan](../roadmap/ci-management-refactor.md) ·
[UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md) ·
[UX Program](../roadmap/ux-program.md) ·
[Master Plan](../roadmap/master-plan.md) ·
[Truth Matrix](truth-matrix.md) ·
[Known Gaps](known-gaps.md)
