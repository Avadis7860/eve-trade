# CI Validation

Status: CURRENT — CI-001J PRE-MERGE CLOSURE
Scope: GitHub Actions regression gate and certification model
Source of truth: \`.github/workflows/ci.yml\` and \`.github/workflows/phase-2.7c-sde.yml\`
Implementation: CI-001C/D/E/F/G harden security, topology, ownership, browser isolation and scope routing; CI-001H separates Main Smoke and Full Repository Certification; CI-001I adds durable timing/churn observability
Tests: \`npm run test:ci-config\` plus all validation and browser gates below

Baseline: [CI-001A/B — Baseline](../audits/ci-management-baseline-2026-09-23.md)
Evidence map: [CI-001B — Evidence Map](ci-evidence-map.md)
Test taxonomy: [CI-001E — Test Taxonomy](ci-test-taxonomy.md)
Browser model: Auth/Operations are isolated by job; `workers: 1` remains mandatory
CI gate: `CI / required-gate` is the stable PR aggregation surface; Main and Full are separate certification workflows

## Current pipeline

The PR certification workflow performs change-scope detection first, then executes the selected families independently: \`static\`, \`unit_domain\`, \`server\`, \`build\`, \`browser-auth\` and \`browser-operations\`. The historical \`validate\` and \`browser-e2e\` jobs remain compatibility aggregators, while \`CI / required-gate\` is the stable PR aggregation surface.

Documentation-only scope runs only routing/aggregation. Frontend-only scope runs static/build/browser. CI, config, domain, server, SDE, test or ambiguous scope conservatively falls back to the complete certification set.

## Current measured baseline

Reference main:
\`d7f245ec47a8746306792ce6017496f9123c23d6\`

Reference successful run:
\`35826687206\`

Measured order of magnitude:

| Component | Duration |
|---|---:|
| \`validate\` | ~104 s |
| \`browser-e2e\` | ~166 s |
| workflow path because browser waits for validate | ~276 s |

Inside \`validate\`:

- \`npm ci\`: ~9 s;
- frontend typecheck: ~17 s;
- backend typecheck: ~10 s;
- \`npm test\`: ~35 s;
- production build: ~7 s.

Inside \`browser-e2e\`:

- \`npm ci\`: ~6 s;
- Playwright/Chromium installation: ~21 s;
- browser tests: ~131 s.

The figures are baseline measurements, not SLAs.

## Browser gate ownership

The browser jobs remain separate from the non-browser validation surface.

The previous ordering was known to be suboptimal; the certified topology now lets browser and non-browser families progress in parallel:

\`\`\`
static ────────────────┐
unit_domain ────────────┤
server ────────────────┤──► validate (compatibility check)
build ─────────────────┘

browser-auth ────────────┐
browser-operations ───────┤──► browser-e2e (compatibility check)
\`\`\`

This topology is now implemented and certified by PR run `35856208503`.

The browser harness still contains mutable control state; therefore Auth and Operations are isolated by job and `workers: 1` remains the safe operating mode.

## Concurrency policy

Current main uses:

\`\`\`yaml
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
\`\`\`

This cancels obsolete runs for a given workflow reference, but distinct PRs remain distinct concurrency groups.

This is intentional evidence for the CI management study: concurrency prevents some redundant compute but cannot replace the rule **one chantier = one active PR**.

See [Audit CI — gestion, performance et gouvernance](../audits/ci-management-audit-2026-09-23.md).

## SDE truth gate

\`.github/workflows/phase-2.7c-sde.yml\` validates changes affecting the canonical universe graph against pinned CCP SDE build \`3503375\`.

The gate:

- detects SDE-sensitive paths;
- regenerates the canonical graph/manifest;
- fails on drift;
- uses read-only repository permissions;
- now pins checkout/setup-node to immutable SHAs and verifies Node.js 22.23.2 / npm 10.9.8.

It is currently low-cost and reliable. CI-001 will align its concurrency and result presentation with the future certification model.

## Reference historical proof

PR #46 established the deterministic browser gate:

- merged head: \`1d56ace077d909dc544a641ed62d22ecae371bd3\`;
- squash merge on \`main\`: \`9438bbedb2d44cf3f5f371144bcf72094955cd46\`;
- CI Foundation run \`35814072097\`: success;
- Phase 2.7C SDE Truth Gate run \`35814072067\`: success.

The target-PC real-CCP smoke is recorded as PASS in [Browser E2E Validation](e2e.md).

## Current CI model

CI-001 defines three functional levels:

1. **PR Fast Gate** — scope-aware short feedback during Draft/iteration;
2. **PR Certification Gate** — complete conditional proof for the active PR;
3. **Main / Full** — short post-merge smoke plus scheduled/manual exhaustive certification, now implemented as dedicated workflows.

The final architecture also includes a stable \`CI / required-gate\` aggregator so conditional jobs do not become branch-protection hazards.

## Required-check caution

The actual branch protection/rulesets for \`main\` could not be inspected with the available GitHub integration because the relevant API endpoints returned \`403 Resource not accessible by integration\`.

No check name should be changed during CI-001 until the effective protection configuration is verified with administrative access.

## CI-001I observability

The PR, Main Smoke and Full workflows expose a dedicated `CI / observability` job. It reads the current workflow's Jobs API with `actions: read` only, captures job and step timestamps, calculates recent workflow duration statistics, reports cancellation/rerun frequency, writes a machine-readable JSON artifact and publishes the slowest observed steps in the run summary. The collector never participates in the stable required-gate.

Artifacts are retained for 30 days so several runs can be compared without changing functional gates.

## Documentation

- Deep study: [CI management audit](../audits/ci-management-audit-2026-09-23.md)
- Planned refactor: [CI-001](../roadmap/ci-management-refactor.md)
- Current contributing rules: [CONTRIBUTING.md](../../CONTRIBUTING.md)
- Browser proof: [e2e.md](e2e.md)

## Completion status

**CI-001G is certified; CI-001H is implemented; CI-001I is runtime-verified on PR run `35856208503` for head `9d09d8affac903de6c2ca8f39156b5b662d4fef4`.** Main Smoke and Full remain independent post-merge/scheduled health checks.

The topology change is additive in proof ownership: existing commands remain present, the historical `validate` check name remains available, and browser execution is no longer downstream of non-browser validation.

## CI-001I evidence

PR run `35856208503` completed successfully on head `9d09d8affac903de6c2ca8f39156b5b662d4fef4`. Change Scope, Static, Unit/Domain, Server/API/Security/ESI, Production Build, Browser Auth, Browser Operations, both compatibility aggregators, `CI / required-gate` and `CI / observability` all succeeded. SDE Truth Gate run `35856208652` also succeeded. The observability artifact sampled 49 completed runs: 39 cancelled, 5 failed and 5 successful (79.6% cancellation rate); the slowest current lane was Browser Auth at ~139 s, with Unit/Domain ~59 s and Browser Operations ~88 s.
