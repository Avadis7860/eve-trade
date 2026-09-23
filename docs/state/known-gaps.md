# Known Gaps

Status: CURRENT
Scope: functional and operational gaps revalidated against current `main`
Source of truth: code, tests, CI and current state documents

## Functional gaps

- UI de scope corporation remains less developed than the underlying ownership/ESI domain.
- Assets, inventory and logistics corporation domains are not implemented.
- Deterministic browser E2E is merged to `main`, covered by CI, and the target-PC real CCP SSO/ESI smoke is PASS.
- Prediction/calibration depends on accumulating valid historical observations.

## Structural / operational gaps

- IndexedDB decomposition is not implemented.
- Large UI components remain.
- Performance is not yet protected by a dedicated measurement gate.
- The active market outcome scheduler exists in `App.tsx`; remaining work is to validate its operational behavior through the appropriate future UI/E2E surface.
- Real-PC acceptance was executed successfully on 2026-09-23; no remaining acceptance gap is recorded for E2E-001.

## Historical reclassification

Older audits can mention duplicate corporation ESI paths, numeric OrderId risk, observer/owner confusion, static-route authority or missing API tests. Those are historical after the merged stabilization sequence and must not be copied into current backlog without fresh evidence.
