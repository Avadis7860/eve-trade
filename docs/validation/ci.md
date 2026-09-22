# CI Validation

Status: STABLE
Scope: GitHub Actions regression gate
Source of truth: `.github/workflows/ci.yml`
Implementation: GitHub Actions workflow
Tests: `npm run test:ci-config` plus all gates below
CI gate: this workflow

## Current pipeline

Node.js 22 + `npm ci`, then frontend typecheck, backend typecheck, CI workflow contract tests, catalog/universe truth, corporation treasury/ESI boundary, full unit suite, API integration, server smoke, security hardening, ESI tests and production build.

## Additional SDE gate

`.github/workflows/phase-2.7c-sde.yml` validates changes affecting the canonical universe graph against pinned CCP SDE build `3503375`.

## Baseline evidence

The baseline commit `6e2d4aea524e29ed35e0419ea5f5519dd50c613e` has a completed successful `Validation & Non-Regression Gate` check.
