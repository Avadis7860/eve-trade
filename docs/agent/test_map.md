# Agent Test Map

A task is not complete until its affected validation surface is identified. This map reflects the current repository scripts and CI workflow.

## Change-area map

| Change area | First validation surface | Additional checks |
|---|---|---|
| `src/engine/**` | Matching suite under `src/engine/__tests__/` | `npm test`, typecheck and build |
| ESI backend client/routes | `server/__tests__/esi_hardening.test.ts` and API/smoke suites | `server/__tests__/corporation_esi_gateway.test.ts`, `server/__tests__/character_routes_contract.test.ts`, `npm run test:esi`, `npm run test:api`, build |
| Backend security/auth | `server/__tests__/security_hardening.test.ts` | API/smoke + `npm run test:security` |
| API route contracts | `server/__tests__/api_integration.test.ts` | Smoke/security/ESI suites as applicable |
| Character transactions | `character_transaction_ingestion.test.ts` / `character_transaction_persistence.test.ts` | Execution correlation and integration suites |
| Execution correlation/outcome | `execution_correlation.test.ts` / `execution_outcome.test.ts` | Tracking integration and realized financial outcome suites |
| IndexedDB | Persistence/schema-related engine suites plus TypeScript/build | Full regression suite and build |
| Catalog/data | `catalog_integrity.test.ts` / `type_catalog.test.ts` | Data-contract/provenance and API status checks |
| React components/context/hooks | TypeScript + production build | Relevant integration tests where present |
| OAuth/SSO | `server/__tests__/security_hardening.test.ts` + API | navigateur local hors Google AI Studio avant E2E produit |
| Route engine 2.7B | `src/engine/__tests__/route_engine.test.ts` | graph validation + shortest path + security traversal + certification + UNKNOWN + determinism; integration remains pending until canonical SDE artifact exists |
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

Dependency installation uses `npm ci --no-audit --no-fund` with the committed `package-lock.json` for reproducible builds.

## Local validation commands

- `npm run typecheck`: frontend/application TypeScript check
- `npm run typecheck:server`: backend TypeScript check
- `npm test`: engine/domain regression suite
- `npm run test:server`: API + smoke + security + ESI backend suites
- `npm run build`: production frontend and backend build

Agents must report the checks actually executed; documentation alone is never evidence of validation.

- `src/engine/__tests__/catalog_universe_truth.test.ts` — canonical catalog/universe cardinality + checksum, truncation/corruption rejection, unknown route/location semantics.


## Truth gate validation
- `npm run test:truth` — isolated Catalog & Universe canonical identity, truncation, provenance, route UNKNOWN and dynamic-cache boundary checks.
- The truth gate runs before `npm test` in CI so regressions in canonical data contracts cannot be hidden behind unrelated unit-suite failures.


- Inter-regional purity: `interregional_purity.test.ts` — deterministic core, repository isolation, UNKNOWN/dynamic rejection and architectural import/time guard.


## E2E navigateur — ordre obligatoire
1. Corriger et valider OAuth/SSO dans un navigateur local.
2. Vérifier callback, session, refresh et accès authentifié.
3. Seulement ensuite lancer l'E2E fonctionnel complet.
4. Couvrir aussi UNKNOWN/PARTIAL/ERROR, pas seulement le chemin nominal.

## Phase 4.6 — Corporation ESI validation

The corporation boundary has a dedicated gateway contract suite and is included in the existing `test:esi` CI gate.

Required regression surfaces:

- gateway endpoint/path/query/principal mapping;
- static architecture guard preventing direct `fetchEsi` calls from character routes;
- anonymous vs character credential isolation;
- metadata propagation;
- ESI error status preservation;
- 304 and null-payload semantics;
- negative/zero/decimal wallet fidelity;
- real Express -> CharacterEsiGateway -> CorporationEsiGateway -> EsiGateway -> ESI mock traversal;
- treasury source isolation for character-negative/corporation-positive and corporation-unavailable scenarios.
