# Current State

Status: CURRENT
Scope: current main
Source of truth: code, tests, CI and manifests
Implementation: src/, server/, .github/workflows/
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

The functional E2E-001 baseline is 9438bbedb2d44cf3f5f371144bcf72094955cd46. Deterministic browser CI is green and the target-PC real-CCP SSO/ESI smoke PASS was recorded on 2026-09-23.

The current UX-first program is now completing the P0 market/ESI retrieval reliability work. UX-01 technical implementation is merged; the target-PC market-order incident remains NOT ROOT-CAUSED.

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

CI-001A/B froze the baseline/evidence map; C hardened workflow security/reproducibility; D split the validation topology; E formalized canonical ownership; F isolated browser Auth/Operations; G established scope routing plus `CI / required-gate`; H separated Main/Full and recovery; I added durable timing/churn observability; J synchronized closure documentation.

Post-merge behavior is now intentionally split: PR changes run the PR certification surface, while pushes to `main` run the short Main Smoke surface. Full Repository Certification is scheduled/manual.

Historically, during CI-001E:

- `ci.yml` is the PR certification mechanism and owns the stable `CI / required-gate`;
- the Main Smoke workflow owns push-to-main smoke validation;
- the SDE Truth Gate remains authoritative for SDE-sensitive changes;
- no required check name should be changed without administrative branch-protection verification;
- the single active branch/PR rule remains mandatory; never reuse a merged branch for the next chantier.

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
- UX-02 Operations is merged and its decision-loop validation is certified by PR #61 run `35859213922`: keep / adjust / relocate / cancel plus explicit LIVE/ERROR/PARTIAL/STALE behavior are covered.
- No coherent Real Portfolio vs Proposed Allocation split exists yet.
- No automatic ESI-derived performance history replaces the manual journal yet.
- No clear business Control Center exists yet.
- Cockpit remains too item-centric to serve as a decision-oriented synthesis.

## Current chantier / sequencing

**The current active chantier is P0 market/ESI retrieval observability**, on branch `fix/market-retrieval-observability`. UX-02 is merged and no longer has an active PR.

UX-01 is technically implemented and merged. Its target-PC market-order incident remains NOT ROOT-CAUSED pending the required PC-side evidence.

CI-001 is merged and is no longer an active chantier. Its observed Draft-routing mismatch is recorded as a separate CI follow-up.

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 remain deferred behind the UX sequencing gate.

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
