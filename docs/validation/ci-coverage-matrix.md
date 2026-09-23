# CI-001 — Global Coverage Matrix

Status: ACTIVE IMPLEMENTATION GATE — CI-001I
Date: 2026-09-23
Scope: durable coverage of CI, validation, security, delivery and governance
Parent: [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
Baseline snapshot: [CI-001A/B — Baseline](../audits/ci-management-baseline-2026-09-23.md)
Evidence map: [CI-001B — Evidence Map](ci-evidence-map.md)
Baseline: main @ \`d7f245ec47a8746306792ce6017496f9123c23d6\`

## Purpose

This matrix exists to prevent CI-001 from becoming a performance-only refactor.

A priority chantier on CI must preserve or improve coverage across five dimensions:

1. correctness;
2. security;
3. reproducibility;
4. operational resilience;
5. governance and maintainability.

A future optimization is not accepted merely because it reduces wall-clock time.

## Coverage status legend

- **COVERED** — already has a concrete proof surface on current main.
- **PARTIAL** — a proof exists, but the architecture or governance is incomplete.
- **GAP** — no durable proof or control is currently established.
- **CONDITIONAL** — required only if the repository adopts the corresponding GitHub feature or release model.

## Coverage matrix

| Area | Current state | Coverage | CI-001 phase | Durable target |
|---|---|---|---|---|
| Frontend type correctness | \`npm run typecheck\` | COVERED | C | fast + certification |
| Backend type correctness | \`npm run typecheck:server\` | COVERED | C | fast + certification |
| Workflow contract correctness | \`test:ci-config\` | COVERED | A/G | meta-tests remain authoritative |
| Runtime configuration | \`test:config\` | COVERED | E | fast/cert |
| Auth/JWT correctness | \`test:auth-token\` + security | COVERED | E | fast/cert |
| Catalog/universe truth | truth tests + SDE gate | COVERED | E/G | cert + SDE when sensitive |
| Financial/accounting correctness | unit + financial suites | COVERED | E | canonical ownership preserved |
| Execution/evidence/provenance | unit/proof suites | COVERED | E | certification remains explicit |
| Persistence | persistence/transaction suites | COVERED | E | full suite + future dedicated gate |
| Corporation boundary | corporation boundary + ESI | COVERED | E | cert on affected scope |
| API correctness | API integration | COVERED | D/E | server certification |
| Server boot/runtime | smoke test | COVERED | D/E/H | post-merge smoke |
| ESI protocol/gateway | ESI + security tests | COVERED | D/E | cert + failure-path proof |
| Market data degraded states | market quality + UX-01 | COVERED | E | regression of LIVE/CACHE/STALE/PARTIAL/ERROR/UNKNOWN |
| Browser OAuth/ESI composition | Playwright | COVERED | F | split into Auth and Operations jobs |
| Browser critical trading workflows | only Operations increment currently | PARTIAL | F + later E2E-002 | expand after UX contracts |
| Browser parallel safety | Auth and Operations isolated by job; each job keeps `workers=1`; harness module state remains local to its job | PARTIAL | F | prove state isolation before workers>1 |
| SDE artifact integrity | dedicated read-only SDE gate | COVERED | G | same source/trigger/concurrency model |
| General change detection | deterministic domain router in `scripts/ci-scope.mjs`, fixture-tested and exercised by `detect-changes` | COVERED | G | conservative domain detection |
| Stable required check | `CI / required-gate` is a dedicated always-evaluated aggregation surface | COVERED | G | `CI / required-gate` |
| Branch protection verification | API access unavailable in study | GAP / UNKNOWN | G | admin-verified required checks |
| Merge queue compatibility | not evidenced in repo | CONDITIONAL | G | add \`merge_group\` if adopted |
| Concurrency governance | same-reference cancellation only | PARTIAL | D/G/H | per-PR stale-run cancellation + explicit PR policy |
| PR lifecycle governance | implicit | PARTIAL | H | Draft iteration / Ready certification / no PR churn |
| Test taxonomy | canonical ownership doc + controlled overlap reduction | PARTIAL | E | one canonical responsibility per test |
| Flaky-test policy | no explicit quarantine/ownership model | GAP | E/H | classify, quarantine, fix, re-enable |
| Failure diagnostics | browser artifacts; standard job logs elsewhere | PARTIAL | H | failure-specific artifacts/summaries |
| Retry policy | browser retry=1; no global policy | PARTIAL | H | retries only where justified and visible |
| Timeout policy | job timeout exists | PARTIAL | H | job + critical-step timeouts |
| CI performance metrics | workflow/job/step timing plus recent cancellation/rerun history emitted as JSON artifacts and run summaries | COVERED | I | durable metrics and baseline |
| Test duration telemetry | CI step timings classify test/check, npm install, browser setup and build; slowest steps are surfaced | COVERED | I | slowest suites visible |
| Main post-merge validation | dedicated short Main Smoke workflow on `push` to `main`; first dedicated runtime proof pending | PARTIAL | H | short smoke by default |
| Full repository certification | dedicated scheduled/manual Full workflow implemented; first dedicated runtime proof pending | PARTIAL | H | scheduled/manual exhaustive proof |
| Dependency vulnerability review | no dedicated dependency-review proof found | GAP / CONDITIONAL | C/I | PR dependency change detection + scheduled vulnerability scan when supported |
| Static application security analysis | no CodeQL workflow/configuration found in repository search | GAP / UNKNOWN | C/I | establish or explicitly rule out SAST coverage |
| Dependency maintenance automation | no Dependabot/Renovate configuration found in repository search | GAP / UNKNOWN | I | establish automated update/alert ownership or explicitly document another mechanism |
| Documentation integrity | documentation guide requires link/status consistency; no dedicated CI link-integrity gate identified | PARTIAL | I/J | validate active documentation links and status consistency |
| Workflow token permissions | main CI + SDE explicitly declare \`contents: read\` | COVERED | C | explicit minimum permissions |
| Action immutability | checkout/setup-node/upload-artifact pinned to immutable SHAs | COVERED | C/I | reviewable SHA maintenance policy |
| Secret handling | application tests cover auth boundaries; CI security policy not separately mapped | PARTIAL | C | explicit secret exposure rules |
| Validation topology | static, unit/domain, server and build execute independently; browser is independent of `validate` | D | COVERED | representative runs must prove lower wall-clock without coverage loss |
| Dependency / lockfile reproducibility | \`npm ci\` + lockfile | COVERED | C | preserve locked installs |
| Node/runtime reproducibility | Node 22.23.2 + npm 10.9.8 explicitly verified | COVERED | C/D/I | explicit supported runtime + monitored action runtime |
| Runner environment drift | \`ubuntu-latest\` | PARTIAL | I | intentional runner policy or periodic verification |
| Artifact provenance | no release-attestation requirement | CONDITIONAL | C/I | assess only if release/distribution requires it |
| CI documentation | current workflow/runbook exists | COVERED | J | active docs + phase evidence |
| Rollback of CI refactor | explicit CI recovery runbook added in H; exercise and final validation remain | PARTIAL | H/J | every phase reversible |
| CI self-validation | workflow contract tests exist | COVERED | D/E/G/J | meta-contract expanded with new topology and ownership script |
| Human runbook | dedicated CI recovery runbook added for current-head evidence, reruns and rollback | COVERED | H/J | incident/rerun/new-PR decision tree |
| Cost/churn control | recent workflow history reports cancellation rate, rerun count and workflow duration statistics | COVERED | I | runs/PR, cancelled %, reruns and wall-clock tracked |
| Long-term maintenance | action updates handled ad hoc | PARTIAL | I/J | recurring maintenance procedure |

## Required coverage before implementation is declared complete

The following cannot remain \`GAP\` at the end of CI-001:

- required-gate stability;
- test ownership/taxonomy;
- browser isolation model;
- general change detection;
- PR/concurrency governance;
- post-merge versus full certification separation;
- scheduled/manual full certification;
- CI timing observability;
- workflow permission hardening;
- application/dependency security monitoring;
- documentation integrity monitoring;
- action maintenance policy;
- rollback procedure;
- documentation/runbook synchronization.

The conditional rows must have an explicit decision recorded, even when the answer is "not applicable".

## Acceptance rule

For every optimized or removed validation:

> Identify the invariant it protected, identify the replacement proof, then prove equivalence or stronger coverage before deleting the old path.

No test is removed merely because another job "looks similar".

No workflow is made conditional merely because a path appears unrelated.

No required check is renamed without verifying the repository protection configuration.

## Interpretation of unknowns

A repository search cannot prove that GitHub-hosted security settings are disabled. Rows marked UNKNOWN therefore require an administrative/settings verification rather than an implementation guess.

A feature that is intentionally not applicable is not a gap only after that decision is recorded with its scope.

## Final certification of CI-001

CI-001 is complete only when this matrix is re-run against the final implementation and contains no unexplained GAP in a required area.
