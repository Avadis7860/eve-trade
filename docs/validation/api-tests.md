# API Validation

Status: STABLE
Scope: Express HTTP boundary
Source of truth: `server/__tests__/` and `package.json`
Implementation: `server/routes/*`
Tests: `api_integration.test.ts`, `character_routes_contract.test.ts`, `server_smoke.test.ts`
CI gate: API integration + smoke steps in `ci.yml`

## Coverage

HTTP status semantics, parameter validation, authenticated character routes, corporation route resolution, catalog/market/universe endpoints and server startup behavior.

## Rule

Route changes require real HTTP tests or an explicit justification for why the affected surface cannot be exercised.
