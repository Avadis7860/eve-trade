# ESI Contract

Status: STABLE
Owner: backend ESI boundary
Implementation: `server/utils/esiClient.ts`, `server/utils/esiGateway.ts`, gateway classes, `src/services/esi.ts`
Validation: `server/__tests__/esi_gateway.test.ts`, `esi_hardening.test.ts`, character/corporation tests

## Transport

The shared client handles ETag/304, `Retry-After`, ESI error-limit headers and bounded retry behavior. The gateway preserves principal context and response metadata.

## Principal

Public market traffic is owner-neutral. Private character/corporation traffic is partitioned by authenticated character principal and credential fingerprint.

## Collection state

Character collection consumers distinguish usable `AVAILABLE` / `EMPTY` from `PARTIAL`, `UNAVAILABLE` and `ERROR`.

## Failure semantics

HTTP status and upstream failures remain observable. A failed collection is never silently converted to an empty business collection.
