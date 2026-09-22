# Browser E2E Validation

Status: PARTIAL
Scope: end-to-end browser proof
Source of truth: current `package.json` and CI workflow
Implementation: no browser E2E harness is currently a reference gate
CI gate: none

## Current state

The repository has HTTP/API and deterministic service/engine validation, but no browser E2E command in the current package scripts or CI workflow.

## Gate requirement

Before browser E2E becomes a release-quality proof, the local EVE SSO/OAuth callback, session and authenticated API flow must be reproducibly validated outside any special agent environment.
