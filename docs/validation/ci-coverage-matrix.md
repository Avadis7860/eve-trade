# CI-001 — Global Coverage Matrix

Status: CURRENT STUDY / IMPLEMENTATION GATE
Date: 2026-09-23
Scope: durable coverage of CI, validation, security, delivery and governance
Parent: [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
Baseline: main @ \`6e3f611f8bdce6ad42236f7082b3dc044582dbef\`

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
| Browser OAuth/ESI composition | Playwright | COVERED | F | split by browser responsibility |
| Browser critical trading workflows | only Operations increment currently | PARTIAL | F + later E2E-002 | expand after UX contracts |
| Browser parallel safety | workers=1; harness has mutable global state | PARTIAL | F | isolated test state before workers>1 |
| SDE artifact integrity | dedicated read-only SDE gate | COVERED | G | same source/trigger/concurrency model |
| General change detection | SDE only today | GAP | G | conservative domain detection |
| Stable required check | no dedicated aggregator | GAP | G | \`CI / required-gate\` |
| Branch protection verification | API access unavailable in study | GAP / UNKNOWN | G | admin-verified required checks |
| Merge queue compatibility | not evidenced in repo | CONDITIONAL | G | add \`merge_group\` if adopted |
| Concurrency governance | same-reference cancellation only | PARTIAL | G/H | per-PR stale-run cancellation + explicit PR policy |
| PR lifecycle governance | implicit | PARTIAL | H | Draft iteration / Ready certification / no PR churn |
| Test taxonomy | global + specialized overlap | PARTIAL | E | one canonical responsibility per test |
| Flaky-test policy | no explicit quarantine/ownership model | GAP | E/H | classify, quarantine, fix, re-enable |
| Failure diagnostics | browser artifacts; standard job logs elsewhere | PARTIAL | H | failure-specific artifacts/summaries |
| Retry policy | browser retry=1; no global policy | PARTIAL | H | retries only where justified and visible |
| Timeout policy | job timeout exists | PARTIAL | H | job + critical-step timeouts |
| CI performance metrics | historical run analysis only | GAP | A/I | durable metrics and baseline |
| Test duration telemetry | no canonical per-test timing report | GAP | A/E/I | slowest suites visible |
| Main post-merge validation | full CI reruns on main push | PARTIAL | H | short smoke by default |
| Full repository certification | no dedicated scheduled full gate | GAP | H | scheduled/manual exhaustive proof |
| Dependency vulnerability review | no dedicated dependency-review proof found | GAP / CONDITIONAL | C/I | PR dependency change detection + scheduled vulnerability scan when supported |
| Workflow token permissions | SDE explicit; main CI not explicitly least-privileged | PARTIAL | C | explicit minimum permissions |
| Action immutability | actions referenced by version tags | PARTIAL | C/I | reviewable pinning policy |
| Secret handling | application tests cover auth boundaries; CI security policy not separately mapped | PARTIAL | C | explicit secret exposure rules |
| Dependency / lockfile reproducibility | \`npm ci\` + lockfile | COVERED | C | preserve locked installs |
| Node/runtime reproducibility | Node 22 stated; runner/action runtime evolves | PARTIAL | C/I | explicit supported runtime + monitored action runtime |
| Runner environment drift | \`ubuntu-latest\` | PARTIAL | I | intentional runner policy or periodic verification |
| Artifact provenance | no release-attestation requirement | CONDITIONAL | C/I | assess only if release/distribution requires it |
| CI documentation | current workflow/runbook exists | COVERED | J | active docs + phase evidence |
| Rollback of CI refactor | not yet formalized | GAP | A/J | every phase reversible |
| CI self-validation | workflow contract tests exist | COVERED | G/J | meta-contract expanded with new topology |
| Human runbook | basic runbook exists | PARTIAL | H/J | incident/rerun/new-PR decision tree |
| Cost/churn control | historical evidence only | PARTIAL | A/I | runs/PR, cancelled %, reruns and wall-clock tracked |
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

## Final certification of CI-001

CI-001 is complete only when this matrix is re-run against the final implementation and contains no unexplained GAP in a required area.
