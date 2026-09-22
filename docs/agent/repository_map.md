# Agent Repository Map

## Purpose

This map is a compact navigation layer for AI agents. It complements the human-oriented architecture documents and must remain aligned with the repository structure.

## Source of truth

- Agent operating rules: `AGENTS.md`
- Contribution conventions: `CONTRIBUTING.md`
- Global architecture narrative: `ARCHITECTURE.md`
- ESI contract: `docs/api_and_esi_integration.md`
- Operations: `docs/operations_and_runbook.md`
- Algorithm audit: `docs/algorithms_and_engine_audit.md`
- Agent workflow: `docs/agent_workflow_and_guidelines.md`

## Layer map

| Path | Responsibility | Validation |
|---|---|---|
| `src/engine/` | Pure domain calculations and deterministic transformations | `src/engine/__tests__/` |
| `src/services/` | Orchestration, persistence, ESI integration and application services | Unit/integration tests |
| `src/domain/` | Domain models and reference logic | Domain tests where present |
| `src/types/` | Domain contracts split by concern | TypeScript compiler + consumers |
| `src/components/` | React presentation | Build + UI tests where present |
| `src/data/` | Static universe/catalog data and fallback data | Catalog/integrity tests |
| `server/` | Backend routes and shared server utilities | Server/integration tests |
| `server.ts` | Express application entrypoint | Build + integration tests |

## Type modules

The former monolithic `src/types.ts` was split by domain. Agents must search `src/types/` before assuming a type has a single central definition.

- `universe.ts`: universe, locations, regions, type resolution
- `market.ts`: market data, observations, quality/provenance
- `financial.ts`: financial configuration, opportunities and calculations
- `character.ts`: character/session/fleet contracts
- `execution.ts`: execution correlation and outcome contracts

## ESI boundary

Backend ESI calls should be inspected through `server/utils/esiClient.ts` before modifying route-level fetch logic. The shared client currently exposes pagination and conditional-request metadata.

## Persistence boundary

IndexedDB implementation: `src/services/indexedDbStore.ts`. Current documented schema: v5 with 11 object stores. Verify the implementation before changing schema-sensitive documentation.

## Agent navigation rule

For a new task: identify the owning layer → inspect the relevant type contract → inspect the implementation → inspect adjacent tests → consult the applicable invariant document → modify only the required surface.
