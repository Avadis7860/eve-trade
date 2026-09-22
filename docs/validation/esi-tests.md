# ESI Validation

Status: STABLE
Scope: ESI transport, gateway and collection semantics
Source of truth: `server/__tests__/`, `src/services/__tests__/esi.test.ts`
Implementation: shared ESI client/gateway + domain gateways + `EsiService`
CI gate: `npm run test:esi`, plus corporation boundary

## Coverage

Transport status propagation, ETag/304, Retry-After, ESI error limits, credential isolation, character/corporation gateway boundaries, corporation order pagination/authorization and explicit collection states.

## Corporation path

`corporation_esi_gateway.test.ts`, `corporation_esi_architecture.test.ts`, `character_routes_contract.test.ts` and corporation treasury tests protect the character-authorized corporation boundary.
