# Current State

Status: CURRENT
Scope: current `main`
Source of truth: code, tests, CI and manifests
Implementation: `src/`, `server/`, `.github/workflows/`
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

Current `main` is `a31979c6c76ba93cc19a7437894f3935e69a01c7`, the merge commit following PR #45. The active documentation baseline was updated by PR #45; the browser harness remains unmerged until E2E-001 completes.

## Stable foundations

- Canonical catalog protected by version/count/checksum manifest.
- Canonical CCP SDE-backed universe graph protected by manifest, provenance, checksum and cardinality.
- Shared backend ESI transport with principal-aware gateway behavior, ETag/304 and rate-limit metadata.
- Corporation ESI authorized through the authenticated character; no synthetic corporation credential.
- Canonical string `OrderId`, with unsafe numeric values rejected.
- Explicit economic ownership separated from observing principal.
- Explicit ESI collection states.
- `RealizedFinancialOutcomeEngine` is the accounting source of truth.
- IndexedDB version 5 with 11 object stores.
- Market outcome scheduler is started by `App.tsx` and stopped on unmount.
- Modular documentation architecture is now the active governance model.

## Incomplete / to monitor

- `IndexedDbStore` remains a large monolithic service; structural decomposition is not implemented.
- Browser E2E is not yet a release/reference gate on `main`; E2E-001 is the active implementation branch.
- Initial-load/runtime performance is not a dedicated CI gate.
- Corporation trading UI scope is less mature than the underlying domain boundary.
- The current IndexedDB `http_cache` has no active private-data business consumer.

## Current chantier

E2E-001 is establishing a reproducible browser-level authentication proof covering the real application/frontend/backend/session wiring, with a deterministic OAuth/ESI test path for CI and a separately documented real CCP SSO smoke test using a dedicated disposable test account.

## Reference paths

[Documentation](../index.md) · [Architecture](../architecture/overview.md) · [Truth Matrix](truth-matrix.md) · [Stable Domains](stable-domains.md) · [Browser E2E](../validation/e2e.md) · [Trading](../domains/trading/orders.md) · [Financial Truth](../domains/finance/financial-truth.md) · [Persistence](../architecture/persistence.md) · [Master Plan](../roadmap/master-plan.md)
