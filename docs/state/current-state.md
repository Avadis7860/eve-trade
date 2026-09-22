# Current State

Status: CURRENT
Scope: current `main`
Source of truth: code, tests, CI and manifests
Implementation: `src/`, `server/`, `.github/workflows/`
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

Current `main` is `eb7810dde5b4a1f3b7b1949d6a512cd606c853d1`, the squash merge of documentation PR #44. PR #44 changed only documentation surfaces; it introduced no functional code changes. The post-merge main CI completed successfully.

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
- Browser E2E is not yet a reference CI gate; E2E-001 is the next planned chantier.
- Initial-load/runtime performance is not a dedicated CI gate.
- Corporation trading UI scope is less mature than the underlying domain boundary.
- The current IndexedDB `http_cache` has no active private-data business consumer.

## Next chantier

E2E-001 will establish a reproducible browser-level authentication proof covering the real application/frontend/backend/session wiring, with a deterministic OAuth/ESI test path for CI and a separately documented real CCP SSO smoke test using a dedicated disposable test account.

## Reference paths

[Documentation](../index.md) · [Architecture](../architecture/overview.md) · [Truth Matrix](truth-matrix.md) · [Stable Domains](stable-domains.md) · [Browser E2E](../validation/e2e.md) · [Trading](../domains/trading/orders.md) · [Financial Truth](../domains/finance/financial-truth.md) · [Persistence](../architecture/persistence.md) · [Master Plan](../roadmap/master-plan.md)
