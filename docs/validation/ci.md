# CI Validation

Status: VALIDATED ON PR #46
Scope: GitHub Actions regression gate
Source of truth: `.github/workflows/ci.yml`
Implementation: GitHub Actions workflow
Tests: `npm run test:ci-config` plus all validation and browser gates below
CI gate: this workflow

## Current pipeline

The `validate` job runs Node.js 22 + `npm ci`, frontend typecheck, backend typecheck, CI workflow contract tests, runtime configuration tests, EVE SSO JWT validation tests, catalog/universe truth, corporation treasury/ESI boundary, full unit suite, API integration, server smoke, security hardening, ESI tests and production build.

The `browser-e2e` job runs after `validate`, installs Chromium through Playwright, and executes the deterministic browser OAuth/ESI composition gate. It does not require a CCP account or personal credentials and uploads Playwright diagnostics on completion.

## PR #46 evidence

Head validated: `5ea63b6f746f84d683de7c424c98cbcc4aca26f5`

- CI Foundation & Regression Gate: run `35812622584` — success.
- Validation & Non-Regression Gate: success.
- Browser E2E — OAuth/ESI composition: success.
- Browser E2E — deterministic OAuth/ESI: success.
- Phase 2.7C SDE Truth Gate: run `35812622594` — success; SDE-sensitive job was correctly skipped for this head.

These results prove the deterministic branch/PR gate. They do not replace the separate target-PC real-CCP smoke.

## Browser gate ownership

The browser job is intentionally separate from the existing validation job so browser tooling is not injected into every non-browser test step. It is expected to become part of the required PR gate when E2E-001 is merged.

## Additional SDE gate

`.github/workflows/phase-2.7c-sde.yml` validates changes affecting the canonical universe graph against pinned CCP SDE build `3503375`.

## Historical evidence

The earlier baseline commit `6e2d4aea524e29ed35e0419ea5f5519dd50c613e` has historical successful validation evidence. E2E-001 completion must use the actual branch/PR workflow result rather than historical baseline status.
