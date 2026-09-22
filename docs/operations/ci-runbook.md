# CI Runbook

Status: CURRENT
Scope: GitHub Actions validation

## Standard gate

The main CI workflow runs on main pushes and pull requests and covers Node 22 installation, typechecks, CI-config tests, truth gates, corporation boundary, full unit suite, API, smoke, security, ESI and production build.

## SDE-sensitive changes

Changes to the canonical universe graph trigger the dedicated Phase 2.7C SDE truth workflow. It regenerates the graph from pinned CCP SDE build 3503375 and fails when committed artifacts differ.

## Failure handling

Read the failing job and affected domain document first. Do not weaken or bypass a gate to make a PR green.
