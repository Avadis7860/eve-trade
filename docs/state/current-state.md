# Current State

Status: CURRENT BASELINE
Scope: state captured for documentation reconstruction
Source of truth: code, tests, CI and manifests at baseline SHA `6e2d4aea524e29ed35e0419ea5f5519dd50c613e`
Implementation: `src/`, `server/`, `.github/workflows/`
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Baseline

`main` was at `6e2d4aea524e29ed35e0419ea5f5519dd50c613e` when this mission began. PRs #37–#42 were merged and no PR was open. The main validation check for that commit completed successfully.

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

## Incomplete / to monitor

- `IndexedDbStore` remains a large monolithic service; structural decomposition is not implemented.
- Several frontend components remain large and the browser E2E surface is not a reference CI gate.
- Initial-load/runtime performance work is not a dedicated CI gate.
- The corporation trading UI scope is not yet the primary documented product interaction.
- The current IndexedDB `http_cache` has no active private-data business consumer.

## Reference paths

[Architecture](../architecture/overview.md) · [Trading](../domains/trading/orders.md) · [Corporation](../domains/trading/corporation-trading.md) · [Financial Truth](../domains/finance/financial-truth.md) · [Persistence](../architecture/persistence.md) · [Master Plan](../roadmap/master-plan.md)
