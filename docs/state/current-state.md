# Current State

Status: CURRENT
Scope: current `main`
Source of truth: code, tests, CI and manifests
Implementation: `src/`, `server/`, `.github/workflows/`
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Current baseline

Current `main` is `9438bbedb2d44cf3f5f371144bcf72094955cd46`, the squash merge of PR #46. E2E-001 is complete: deterministic browser CI is green and the target-PC real-CCP acceptance PASS was recorded on 2026-09-23.

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
- Deterministic browser E2E is merged to `main` and green; real CCP SSO/ESI smoke is validated on the target PC.
- Initial-load/runtime performance is not a dedicated CI gate.
- Corporation trading UI scope is less mature than the underlying domain boundary.
- The current IndexedDB `http_cache` has no active private-data business consumer.
- OAuth browser integration uses a single server-owned authorization-code exchange, with popup and popup-blocked paths converging on the same session synchronization flow.

## Current chantier

E2E-001 is complete. The next planned chantier is PST-001: decompose the IndexedDB implementation without semantic drift, using the now-proven browser/authentication safety net.

## Reference paths

[Documentation](../index.md) · [Architecture](../architecture/overview.md) · [Truth Matrix](truth-matrix.md) · [Stable Domains](stable-domains.md) · [Browser E2E](../validation/e2e.md) · [Trading](../domains/trading/orders.md) · [Financial Truth](../domains/finance/financial-truth.md) · [Persistence](../architecture/persistence.md) · [Master Plan](../roadmap/master-plan.md)
