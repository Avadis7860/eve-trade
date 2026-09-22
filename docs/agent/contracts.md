# Agent Contract Map

## Purpose

This document identifies the concrete boundaries that connect the main application layers. It is intentionally implementation-oriented: before changing a boundary, inspect the named type, implementation and validation surface together.

## Contract index

| ID | Boundary | Source of truth | Main consumers / validators |
|---|---|---|---|
| CONTRACT-TYPE-001 | Frontend/domain type exports | `src/types/*.ts` + `src/types/index.ts` | TypeScript compiler, engine/domain tests |
| CONTRACT-ESI-001 | Backend ESI acquisition | `server/utils/esiClient.ts` | API routes, `server/__tests__/esi_hardening.test.ts` |
| CONTRACT-API-001 | HTTP API surface | `server.ts` + `server/routes/*.ts` | API integration, smoke/security suites |
| CONTRACT-IDB-001 | IndexedDB persistence | `src/services/indexedDbStore.ts` | persistence/integration tests + build |
| CONTRACT-CHAR-001 | Character-scoped authenticated data | `server/routes/characters.ts` + character types | character transaction/execution suites |
| CONTRACT-CATALOG-001 | Type catalog API | `server/routes/catalog.ts` + `TypeCatalogService` | catalog/type-resolution tests |
| CONTRACT-TEST-001 | Contract-to-test mapping | `package.json` + `.github/workflows/ci.yml` | CI |

## 1. Frontend ↔ domain

### Public type boundary

The canonical domain type tree is `src/types/`, aggregated by `src/types/index.ts`. The legacy-looking `src/types.ts` path is a compatibility facade only and re-exports the modular tree.

Current type modules:

- `market.ts`: orders, snapshots, market quality/provenance and market data structures.
- `universe.ts`: universe identifiers, locations, routes and type resolution.
- `financial.ts`: financial configuration, fees and outcomes.
- `opportunity.ts`: opportunities, evidence, certification and observations.
- `character.ts`: character sessions, fleet, transactions and character-scoped contracts.
- `execution.ts`: execution tracking, correlation, fills and outcomes.

**Change rule:** prefer the modular type file that owns a contract; do not recreate a parallel interface in a consumer when an existing domain type covers it.

### Application service boundary

Services under `src/services/` orchestrate domain types for UI/application concerns. The frontend ESI service (`src/services/esi.ts`) is distinct from the backend ESI acquisition client. Do not treat the two as interchangeable transport boundaries.

## 2. Frontend ↔ backend HTTP API

The Express application mounts these route groups in `server.ts`:

- `/api/health`
- `/api/auth/*`
- `/api/types/*`
- `/api/markets/*`
- `/api/character/*`
- `/api/universe/*`

### Frontend transport boundary

`src/services/backendApiClient.ts` is the single frontend HTTP transport used by `EsiService` for backend-backed ESI data. It exposes response status, JSON payload and response headers and provides deterministic transport injection for tests. It deliberately contains no ESI retry, rate-limit, ETag or upstream policy.

### Market API

`GET /api/markets/:regionId/orders`

- Required path parameter: positive integer `regionId`.
- Optional query parameters: positive integer `type_id`, integer `page` in 1..1000, `order_type` in `all|buy|sell`.
- Invalid parameters return HTTP 400 with an explicit error code/message.
- Successful responses return the ESI order array.
- Cache state is exposed through `X-Cache-Status`.
- ESI pagination/rate-limit metadata may be forwarded as `X-Pages`, `X-ESI-Error-Limit-Remain`, and `X-ESI-Error-Limit-Reset`.
- A failed ESI response is propagated with its HTTP status and a compact error payload.

`GET /api/markets/:regionId/history`

- Requires positive integer `type_id`.
- Invalid parameters return HTTP 400.
- Successful responses return the ESI daily history array.
- Cache state is exposed through `X-Cache-Status`.

### Catalog API

`GET /api/types/status`

- Returns `TypeCatalogService.getMetadata()`.

`GET /api/types/all`

- Canonical response shape: `{ metadata, types }`.
- Response headers include catalog status/version/checksum/count.
- Corrupted empty catalog => HTTP 500.
- Unavailable empty catalog => HTTP 503.
- `format=flat` is an explicit legacy/script compatibility mode returning the type array directly.

`GET /api/types/search`

- Optional string `q`, limited to 100 characters.
- Optional positive numeric `limit`, capped at 500.
- Returns an array of type records.
- May resolve additional types through ESI when local/dynamic results are insufficient.

`GET /api/types/lookup/:id`

- Requires a positive integer type ID.
- Resolves from canonical catalog, dynamic registry, then ESI.
- Invalid ID => HTTP 400.
- ESI failure/not-found is propagated through the returned status.

### Character API

All `/api/character/:characterId/*` routes validate:

- `characterId` is a positive integer.
- `Authorization` header is present and non-empty.

Current resources include:

- `orders`
- `orders/history?page=1..1000`
- `wallet` (wrapped as `{ balance }`)
- `skills`
- `transactions?from_id=<positive integer>`
- `journal`
- `corporation`
- `corporation/wallets`

For transaction responses, ESI retry/rate-limit metadata is also surfaced through response headers and the error payload.

### Universe API

`GET /api/universe/location/:locationId`

- Requires a positive integer location ID.
- Standard NPC stations are resolved without authentication.
- Structures may be resolved when a valid authorization header is supplied.
- Unknown/unresolved locations return HTTP 404 with error code `LOCATION_UNKNOWN`; they must not become a verified domain location.

### Health API

`GET /api/health`

Returns operational status, uptime, memory, catalog metadata and SSO configuration presence. Catalog degradation can produce a degraded 200 response; unavailable/corrupt catalog state can produce 503.

## 3. Backend ↔ ESI

### Shared client

`server/utils/esiClient.ts` exports:

`fetchEsi<T>(endpoint, options): Promise<EsiFetchResult<T>>`

The result contract includes:

- `ok`
- `status`
- `data`
- `error`
- `etag`
- `expires`
- `errorLimitRemain`
- `errorLimitReset`
- `retryAfter`
- `xPages`

Request behavior includes:

- normalized ESI base URL for relative endpoints;
- default `User-Agent` and JSON `Accept`;
- optional `If-None-Match` from `etag`;
- timeout handling;
- bounded retry behavior for selected transient statuses;
- explicit HTTP 304 handling with `data: null`;
- immediate stop when ESI error budget is exhausted;
- `Retry-After` handling for 420/429, with long delays returned to the caller instead of blocking the backend;
- propagation of ESI pagination, expiration and error-budget metadata.

**Boundary rule:** route code should consume this result contract rather than reimplementing ESI retry, timeout, ETag or error-budget logic.

### Market route caching

`server/routes/markets.ts` adds an application cache above `fetchEsi`.

- Market orders are keyed by the complete ESI URL, including region, order type, page and optional type.
- Cached entries retain data, forwarded headers, expiration and ETag.
- A 304 revalidation refreshes the cache TTL and returns the cached data.
- Cache entries are bounded and periodically garbage-collected.

This is distinct from the browser IndexedDB HTTP cache.

## 4. Application ↔ IndexedDB

Implementation: `src/services/indexedDbStore.ts`.

Database:

- name: `eve_trade_durable_store`
- version: **5**
- object stores: **11**

| Store | Key | Role |
|---|---|---|
| `snapshots` | `key` | verified market snapshots; composite `typeId:regionId` |
| `history` | `key` | historical market statistics; composite `typeId:regionId` |
| `universe_opportunities` | `id` | cached universe opportunities |
| `http_cache` | `url` | ESI HTTP cache entries |
| `market_observations` | `observation_id` | append-only market observations |
| `opportunity_observations` | `observation_id` | append-only opportunity observations/outcomes |
| `market_history_daily` | `key` | raw daily ESI market series |
| `eve_types` | `type_id` | EVE type catalog records |
| `catalog_metadata` | `key` | catalog metadata/audit records |
| `character_transactions` | `transaction_id` | validated, character-scoped wallet transactions |
| `character_executions` | `execution_id` | character-scoped execution records |

Persistence semantics visible at this boundary:

- The store maintains an in-memory fallback for non-browser/failed IndexedDB initialization.
- Character transactions are validated before persistence; invalid state and invalid numeric/identity boundaries raise `PersistenceValidationError`.
- Character execution records require valid execution, character, observation and opportunity identifiers.
- The `character_executions` store enforces uniqueness on `[character_id, observation_id]`.
- Observation stores are designed as append-only evidence boundaries; schema changes require explicit migration reasoning.

**Change rule:** a DB version/store/index/key change is a persistence contract change, not a local refactor. Update migration reasoning, tests and agent documentation together.

## 5. Tests ↔ contracts

The repository's primary contract validation surfaces are:

| Contract | Required validation |
|---|---|
| ESI client | `server/__tests__/esi_hardening.test.ts` / `npm run test:esi` |
| API HTTP surface | `server/__tests__/api_integration.test.ts` / `npm run test:api` |
| Server startup/routes | `server/__tests__/server_smoke.test.ts` / `npm run test:smoke` |
| Security/auth/CORS | `server/__tests__/security_hardening.test.ts` / `npm run test:security` |
| Domain/type contracts | engine/domain suites + `npm run typecheck` |
| Character persistence/correlation | character transaction, execution correlation/outcome and tracking suites |
| IndexedDB/schema | persistence-related engine/integration suites + typecheck/build |
| Catalog | `catalog_integrity.test.ts`, `type_catalog.test.ts` and catalog/API coverage |
| Full regression | `npm test` + production build |

CI currently validates frontend typecheck, backend typecheck, unit/domain tests, API, smoke, security, ESI and production build.

## 6. Contract change protocol

When modifying a boundary:

1. Identify the contract ID above.
2. Read the owning implementation and exported types.
3. Read its direct callers.
4. Read the closest regression suite before changing behavior.
5. Preserve explicit error/unknown/partial states; do not collapse them into successful zero/empty values.
6. For ESI changes, preserve metadata and rate-limit semantics unless the contract is deliberately revised.
7. For IndexedDB changes, treat version/store/index/key changes as migrations.
8. Update this document and the affected test/invariant map when the contract itself changes.
9. Run the narrowest relevant tests first, then the repository CI gate when the PR is ready.

## Related agent maps

- `docs/agent/repository_map.md`
- `docs/agent/invariants.md`
- `docs/agent/test_map.md`

## Phase 2.6 — Catalog & Universe Truth Contracts

The canonical catalog is identified by a fixed manifest containing version, expected cardinality and structural SHA-256. CATALOG_READY is impossible when any value differs or structural validation fails.

The bundled universe dataset is identified by fixed region/system/station counts and a structural SHA-256. The route table contains only canonical known routes; unknown system pairs return UNKNOWN with no usable jump count.

The financial opportunity engine verifies catalog, location and route identity before quantity resolution, transport costing, scoring or prediction. Unknown, dynamic, inferred or unverified inputs are rejected before they can influence a financial result.


## Phase 2.6 — Stabilized truth boundary

The catalog boundary treats the bundled canonical dataset and its manifest as the trust anchor. Caller-supplied metadata is never sufficient to declare readiness. Dynamic ESI resolution remains useful for discovery/display but is excluded from canonical financial resolution.

The universe boundary keeps canonical static locations separate from dynamic ESI/structure resolution. Unknown routes and locations fail closed and never receive synthetic numerical semantics.

Relist demand estimation requires positive observed destination history. Missing history is unavailable data, not zero demand and not a synthetic default.
