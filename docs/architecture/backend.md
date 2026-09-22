# Backend Architecture

Status: STABLE
Scope: Express server, HTTP routes and ESI gateways
Source of truth: `server.ts`, `server/routes/`, `server/gateways/`, `server/utils/`
Implementation: Express application and gateway layer
Tests: `server/__tests__/*`
CI gate: API, smoke, security and ESI gates

## Route layer

Routes validate HTTP inputs, authenticate character-scoped requests where required, invoke gateways/services and preserve relevant HTTP/ESI status.

## Gateway layer

- `CharacterEsiGateway` owns character ESI mappings.
- `CorporationEsiGateway` owns corporation ESI mappings.
- `MarketEsiGateway` owns public market mappings.

Gateways do not invent economic ownership.

## Shared transport

`server/utils/esiClient.ts` handles ETag/304, ESI error-limit headers, Retry-After and bounded retries. `EsiGateway` adds principal-aware request identity and credential-isolated in-flight coalescing.

See [ESI boundary](esi-boundary.md) and [security boundary](security-boundary.md).
