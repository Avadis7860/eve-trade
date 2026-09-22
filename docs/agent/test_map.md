# Agent Test Map

A task is not complete until its affected validation surface is identified. This map reflects the current repository scripts and CI workflow.

## Change-area map

| Change area | First validation surface | Additional checks |
|---|---|---|
| `src/engine/**` | Matching suite under `src/engine/__tests__/` | `npm test`, typecheck and build |
| ESI backend client/routes | `server/__tests__/esi_hardening.test.ts` and API/smoke suites | `npm run test:esi`, `npm run test:api`, `npm run test:smoke`, build |
| Backend security/auth | `server/__tests__/security_hardening.test.ts` | API/smoke + `npm run test:security` |
| API route contracts | `server/__tests__/api_integration.test.ts` | Smoke/security/ESI suites as applicable |
| Character transactions | `character_transaction_ingestion.test.ts` / `character_transaction_persistence.test.ts` | Execution correlation and integration suites |
| Execution correlation/outcome | `execution_correlation.test.ts` / `execution_outcome.test.ts` | Tracking integration and realized financial outcome suites |
| IndexedDB | Persistence/schema-related engine suites plus TypeScript/build | Full regression suite and build |
| Catalog/data | `catalog_integrity.test.ts` / `type_catalog.test.ts` | Data-contract/provenance and API status checks |
| React components/context/hooks | TypeScript + production build | Relevant integration tests where present |
| Documentation only | Diff review, path/reference consistency | No application tests unless a documented contract changes |

## Current CI validation

`.github/workflows/ci.yml` currently runs:

1. frontend typecheck
2. backend typecheck
3. `npm test`
4. `npm run test:api`
5. `npm run test:smoke`
6. `npm run test:security`
7. `npm run test:esi`
8. `npm run build`

Dependency installation uses `npm install --no-audit --no-fund` because the repository currently has no committed npm lockfile.

## Local validation commands

- `npm run typecheck`: frontend/application TypeScript check
- `npm run typecheck:server`: backend TypeScript check
- `npm test`: engine/domain regression suite
- `npm run test:server`: API + smoke + security + ESI backend suites
- `npm run build`: production frontend and backend build

Agents must report the checks actually executed; documentation alone is never evidence of validation.
