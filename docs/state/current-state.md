# Current State

Status: CURRENT
Scope: current `main`
Source of truth: code, tests, CI and manifests
Implementation: `src/`, `server/`, `.github/workflows/`
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

Current `main` is `3babb086dbca7e1b7b2096d703b71e06cfd2ad45`, the squash merge of documentation PR #43. PR #43 changed only documentation surfaces and archived legacy paths; it introduced no functional code changes.

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
- Several frontend components remain large and browser E2E is not a reference CI gate.
- Initial-load/runtime performance is not a dedicated CI gate.
- Corporation trading UI scope is less mature than the underlying domain boundary.
- The current IndexedDB `http_cache` has no active private-data business consumer.

## Reference paths

[Documentation](../index.md) · [Architecture](../architecture/overview.md) · [Truth Matrix](truth-matrix.md) · [Stable Domains](stable-domains.md) · [Trading](../domains/trading/orders.md) · [Financial Truth](../domains/finance/financial-truth.md) · [Persistence](../architecture/persistence.md) · [Master Plan](../roadmap/master-plan.md)
