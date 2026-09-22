# Agent Repository Map

## Purpose

Compact navigation layer for AI agents. Keep this map aligned with the repository tree and with the validation surfaces defined by `package.json` and CI.

## Source of truth

- Agent operating rules: `AGENTS.md`
- Contribution conventions: `CONTRIBUTING.md`
- Global architecture narrative: `ARCHITECTURE.md`
- ESI contract: `docs/api_and_esi_integration.md`
- Operations: `docs/operations_and_runbook.md`
- Algorithm audit: `docs/algorithms_and_engine_audit.md`
- Agent workflow: `docs/agent_workflow_and_guidelines.md`

## Layer map

| Path | Responsibility | Primary validation |
|---|---|---|
| `src/engine/` | Deterministic domain calculations, evidence, execution, portfolio and financial logic | `src/engine/__tests__/` + `npm test` |
| `src/domain/` | Domain repositories and catalog/character abstractions | Domain repository/catalog tests |
| `src/services/` | Application orchestration, ESI integration, persistence, synchronization and analytics | Unit/integration tests + build |
| `src/types/` | Modular domain contracts | TypeScript consumers + `npm run typecheck` |
| `src/types.ts` | Compatibility facade re-exporting `src/types/index.ts` | TypeScript compiler |
| `src/components/` | React presentation/UI | Build + relevant integration coverage |
| `src/context/` | React application providers for auth, catalog and trading configuration | Build + integration coverage |
| `src/hooks/` | React/application synchronization hooks | Build + integration coverage |
| `src/data/` | Static universe and market/catalog reference data | Catalog integrity/type-resolution tests |
| `server/routes/` | Express API route handlers | API integration + smoke/security tests |
| `server/utils/` | Backend infrastructure utilities, including centralized ESI client | ESI/security/server tests |
| `server/__tests__/` | Backend integration, smoke, security and ESI regression suites | `npm run test:server` / CI |
| `server.ts` | Express application entrypoint and route composition | Backend typecheck + build + integration tests |

## Type modules

The domain type system is split under `src/types/`. `src/types.ts` is only a facade.

- `market.ts`: market data, orders, snapshots, quality/provenance
- `universe.ts`: universe, locations, regions, type resolution
- `financial.ts`: financial configuration and financial outcomes
- `opportunity.ts`: opportunities, certification, evidence and observations
- `character.ts`: sessions, fleet, transactions and character-scoped contracts
- `execution.ts`: execution tracking, correlation, fills and outcomes
- `index.ts`: aggregate exports

## ESI boundary

Backend ESI acquisition is centralized in `server/utils/esiClient.ts`. Inspect this client before adding route-level ESI fetch behavior. Its current contract includes ETag/304 handling, `x-pages`, ESI error-limit headers, Retry-After and response cache metadata.

The frontend also contains `src/services/esi.ts`; distinguish browser/application ESI orchestration from the backend acquisition boundary.

## Persistence boundary

IndexedDB implementation: `src/services/indexedDbStore.ts`.

Current implementation uses database version 5 and 11 object stores:
`snapshots`, `history`, `universe_opportunities`, `http_cache`, `market_observations`, `opportunity_observations`, `market_history_daily`, `eve_types`, `catalog_metadata`, `character_transactions`, `character_executions`.

Schema-sensitive changes require migration reasoning and corresponding tests/documentation.

## Agent navigation rule

For a new task:

1. Identify the owning layer.
2. Inspect the relevant type contract.
3. Inspect the implementation and its direct callers.
4. Inspect adjacent tests and the matching `package.json` script.
5. Check the applicable invariant.
6. Modify only the required surface.
7. Run the validation actually applicable to the change and report what ran.
