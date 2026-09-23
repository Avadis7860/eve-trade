# CI Validation

Status: CURRENT — CI-001 ACTIVE / C + D IMPLEMENTED
Scope: GitHub Actions regression gate and certification model
Source of truth: \`.github/workflows/ci.yml\` and \`.github/workflows/phase-2.7c-sde.yml\`
Implementation: CI-001C hardened runtime/supply-chain controls; CI-001D splits the certification topology while retaining the historical `validate` check name
Tests: \`npm run test:ci-config\` plus all validation and browser gates below

Baseline: [CI-001A/B — Baseline](../audits/ci-management-baseline-2026-09-23.md)
Evidence map: [CI-001B — Evidence Map](ci-evidence-map.md)
CI gate: current PR CI; stable aggregator remains a future CI-001G gate

## Current pipeline

The \`validate\` job runs Node.js 22 + \`npm ci\`, frontend typecheck, backend typecheck, CI workflow contract tests, runtime configuration tests, EVE SSO JWT validation tests, catalog/universe truth, corporation treasury/ESI boundary, full unit suite, API integration, server smoke, security hardening, ESI tests and production build.

The \`browser-e2e\` job currently runs **after** \`validate\`, installs Chromium through Playwright, executes the deterministic browser OAuth/ESI composition gate and uploads diagnostics.

The current pipeline is functionally established, but its topology is now the subject of a dedicated study because validation families are unnecessarily serialized.

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

The browser job remains separate from the non-browser validation surface.

The current ordering is known to be suboptimal:

\`\`\`
static ────────────────┐
unit_domain ────────────┤
server ────────────────┤──► validate (compatibility check)
build ─────────────────┘

browser-e2e ───────────────► independent
\`\`\`

CI-001 will first change this to independent jobs so the browser proof can progress while static/server validation is running.

The browser harness currently contains mutable global OAuth and market controls. Therefore the first browser optimization is **job/spec separation with one worker per job**, not an immediate increase of Playwright workers.

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

## Planned CI model

CI-001 defines three functional levels:

1. **PR Fast Gate** — short feedback during Draft/iteration;
2. **PR Certification Gate** — complete proof for a Ready for Review PR;
3. **Main / Full** — short post-merge smoke plus scheduled/manual exhaustive certification.

The final architecture also includes a stable \`CI / required-gate\` aggregator so conditional jobs do not become branch-protection hazards.

## Required-check caution

The actual branch protection/rulesets for \`main\` could not be inspected with the available GitHub integration because the relevant API endpoints returned \`403 Resource not accessible by integration\`.

No check name should be changed during CI-001 until the effective protection configuration is verified with administrative access.

## Documentation

- Deep study: [CI management audit](../audits/ci-management-audit-2026-09-23.md)
- Planned refactor: [CI-001](../roadmap/ci-management-refactor.md)
- Current contributing rules: [CONTRIBUTING.md](../../CONTRIBUTING.md)
- Browser proof: [e2e.md](e2e.md)

## Completion status

The existing CI remains the current certification mechanism.

**CI-001A/B and CI-001C are baselined; CI-001D is the active topology increment.**

The topology change is additive in proof ownership: existing commands remain present, the historical `validate` check name remains available, and browser execution is no longer downstream of non-browser validation.
