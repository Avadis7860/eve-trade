# ESI Boundary

Status: STABLE
Scope: CCP ESI access from frontend through backend
Source of truth: `server/utils/esiClient.ts`, `server/utils/esiGateway.ts`, gateway classes, `src/services/esi.ts`
Implementation: shared transport + principal-aware gateways
Tests: ESI, character, corporation, security suites
CI gate: [validation/esi-tests.md](../validation/esi-tests.md)

## Flow

```
UI/service
  → BackendApiClient
  → Express route
  → domain gateway
  → EsiGateway
  → fetchEsi
  → CCP ESI
```

Public market requests are owner-neutral. Character and corporation requests carry the authenticated character principal and credential.

## Transport guarantees

ETag/304 handling, Retry-After, ESI error-limit signals, bounded retries, response metadata and HTTP status preservation are handled at the ESI boundary.

## Collection semantics

Character collection consumers distinguish usable `AVAILABLE` / `EMPTY` from `PARTIAL`, `UNAVAILABLE` and `ERROR`.

## Corporation rule

Corporation data is authorized by the authenticated character credential. There is no synthetic corporation credential.

[ESI contract](../contracts/esi.md) · [collection invariant](../invariants/esi-data-state.md)
