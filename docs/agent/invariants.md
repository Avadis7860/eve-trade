# Agent Invariants

This file records high-value invariants in compact, indexed form. It complements `AGENTS.md` and should describe behavior visible in the implementation and/or protected by tests.

## ENGINE-PURITY-001

- Scope: `src/engine/**`
- Rule: deterministic domain calculations must not perform network, persistence, DOM or React state operations.
- Validation: engine tests + TypeScript/build.

## DATA-SEMANTICS-001

- Scope: market, catalog and opportunity pipelines
- Rule: `NO DATA ≠ ZERO DATA`.
- Rule: failures, partial data and unknown state remain distinguishable from valid zero-valued business data.
- Validation: market-data quality, failure-semantics and data-contract tests.

## MARKET-IDENTITY-001

- Scope: market order ingestion/aggregation
- Rule: deduplicate orders by CCP `order_id`.
- Validation: order-scoping and market-data regression coverage.

## CHARACTER-ISOLATION-001

- Scope: character transactions and execution correlation/persistence
- Rule: records belonging to one character must never be correlated or queried as another character's records.
- Validation: character transaction, execution correlation and persistence tests.

## EVIDENCE-IMMUTABILITY-001

- Scope: opportunity evidence and market/opportunity observations
- Rule: evidence snapshots and immutable observations must not be silently overwritten.
- Validation: evidence-chain, certification and observation-provenance tests.

## FINANCIAL-SAFETY-001

- Scope: financial engines and monetary calculations
- Rule: protect divisions and invalid numeric inputs; unavailable calculations must not be represented by `NaN` or `Infinity`.
- Validation: financial/property-invariant suites.

## EXECUTION-CORRELATION-001

- Scope: `src/engine/executionCorrelation.ts`, execution persistence
- Rule: execution correlation is scoped by character and observation identity; duplicate character/observation pairs are rejected by the persistence boundary.
- Validation: execution correlation, tracking integration and persistence tests.

## ESI-CLIENT-001

- Scope: `server/utils/esiClient.ts` and callers
- Rule: use the shared backend ESI client rather than reintroducing ad-hoc fetch handling when the shared client covers the request.
- Contract: preserve explicit ETag/304, pagination metadata, ESI error-limit metadata and Retry-After behavior.
- Validation: `server/__tests__/esi_hardening.test.ts`.

## INDEXEDDB-SCHEMA-001

- Scope: `src/services/indexedDbStore.ts`
- Rule: schema/version changes require explicit migration reasoning and corresponding documentation/tests.
- Current implementation: DB version 5 with 11 object stores.

### CATALOG-TRUTH-001 — Canonical catalog identity
CATALOG_READY requires exact canonical cardinality, exact structural SHA-256 and successful structural validation. Runtime payloads cannot define their own trust boundary.

### UNIVERSE-TRUTH-001 — Unknown universe data fails closed
Unknown systems, locations and routes never receive synthetic numerical values. A route is financially usable only when it is KNOWN and its provenance is verified.

### PROVENANCE-001 — Resolution provenance is explicit
Catalog, universe and route resolutions expose source, verification state, confidence and dataset identity. Dynamic, inferred and fallback resolutions are never silently promoted to canonical financial inputs.


## INTERREGIONAL-PURITY-001 — Certified input boundary

The pure inter-regional calculation core must not import or access CatalogRepository, UniverseRepository, ESI, persistence, DOM/React state or wall-clock time. It accepts only `CertifiedInterRegionalInputs` and rejects any input whose Catalog, location, structure or route provenance is not verified/canonical.
Validation: `interregional_purity.test.ts`, typecheck, full engine regression and production build.


## ROUTE-SAFETY-001 — Safe route security floor

- Scope: Phase 2.7B route engine.
- Rule: une route déclarée safe n'est valide que si chaque système effectivement traversé possède security_status >= 0.5, extrémités incluses.
- Rule: la liste ordonnée des systèmes traversés doit être conservée dans le contrat de route afin de rendre la contrainte auditable.
- Status: implemented in `src/domain/universe/RouteEngine.ts` and `src/domain/universe/RouteCertification.ts`. Partial graphs fail closed as UNKNOWN with no usable jump count.

## OAUTH-E2E-001 — Local browser authentication gate

- Scope: EVE SSO/OAuth and future browser E2E.
- Rule: callback OAuth, session, refresh et appels authentifiés doivent fonctionner dans un navigateur local hors Google AI Studio.
- Rule: aucun contournement spécifique à Google AI Studio ne constitue une correction valide.
- Status: blocking prerequisite for product browser E2E.

## CORPORATION-ESI-001 — Character-authorized corporation access

- Scope: `server/gateways/corporationEsiGateway.ts`, corporation routes.
- Rule: corporation authenticated endpoints use the authenticated character principal; no synthetic corporation principal exists.
- Rule: public corporation profile access remains anonymous.
- Rule: credentials from Character A and Character B remain isolated even when both belong to the same corporation.
- Validation: `server/__tests__/corporation_esi_gateway.test.ts`, `server/__tests__/character_routes_contract.test.ts`.

## TREASURY-SOURCE-ISOLATION-001 — Corporation funding is not character funding

- Scope: `TreasuryEngine`, `FinancialConfig.corporation_wallet_source`, active character synchronization.
- Rule: when `treasury_source_mode = corporation`, character wallets and `available_capital` cannot be implicit fallbacks for corporation trading capital.
- Rule: `esi`, `manual` and `unavailable` corporation funding states remain distinct.
- Rule: observed negative corporation or character wallets remain factual; spendable capital is independently normalized to a non-negative value.
- Rule: unavailable corporation data fails closed instead of silently retaining a stale positive character-derived capital.
- Validation: `src/engine/__tests__/treasury.test.ts` and the ESI corporation route/gateway contract suites.
- Legacy persisted corporation configs with missing/invalid provenance normalize to `unavailable`; no legacy numeric balance is automatically certified as ESI or manual capital.
- Validation: `src/engine/__tests__/financial_config.test.ts`.
- Rule: corporation treasury synchronization is orchestrated by `src/services/corporationTreasurySync.ts`; UI and lifecycle consumers must not duplicate profile/wallet sequencing.
- Rule: successful ESI certification requires the requested division to exist with a finite balance and the corporation identity returned by the wallet endpoint to match the resolved profile when present.
- Rule: manual corporation budgets are never populated from `corporation_divisions` merely because the user changes the selected division.

## CORPORATION-DATA-SEPARATION-001 — Transport boundary remains domain-neutral

- Scope: `CorporationEsiGateway`.
- Rule: the gateway maps corporation ESI contracts only; it must not contain trading, treasury or future industry business calculations.
- Rule: future corporation features (orders, assets, industry, logistics) must reuse this boundary rather than introduce direct `fetchEsi` calls from routes or domain consumers.


## TRADING-OWNERSHIP-001 — Observing principal is not economic owner

- Scope: `EveCharacterOrder` / `EveCharacterOrderHistory` and order scoping.
- Rule: the authenticated character (`principal_character_id`) is the observing/authorizing principal, not automatically the economic owner.
- Rule: `ownership.owner_type` is authoritative when present and is either `character` or `corporation`.
- Rule: a corporation-owned order must never acquire the observing character's `character_id`/`character_name` projection.
- Rule: legacy orders marked `is_corporation=true` are not inferred to be personally owned.
- Validation: `order_scoping_contracts.test.ts`, future corporation-order contract suites.


## ORDER-ID-IDENTITY-001 — Order IDs are canonical identifiers

- Scope: market orders, character orders, order history, price-level audit metadata and execution order references.
- Rule: canonical order IDs are strings; they are never used as arithmetic values.
- Rule: numeric order IDs are accepted only when `Number.isSafeInteger` is true; unsafe numeric values fail closed because JavaScript JSON parsing may already have lost precision.
- Rule: canonical comparisons and deterministic sorting use identifier-aware logic and never coerce canonical IDs through `Number()`.
- Rule: order de-duplication keys use the canonical identifier representation.
- Validation: `src/engine/__tests__/order_identity.test.ts`, ESI and full regression suites.


## CORPORATION-ORDERS-001 — Corporation trading orders keep principal and owner distinct

- Scope: `CorporationEsiGateway`, corporation trading order routes.
- Rule: the authenticated principal is always the character whose credential is used; the corporation is an economic owner/resource target, never an authentication principal.
- Rule: routes resolve `corporation_id` from the route character's public identity instead of accepting an arbitrary corporation identifier from the caller.
- Rule: Character A and Character B may observe the same corporation through distinct credentials without request coalescing across principals.
- Rule: a character in corporation Y cannot be routed to corporation X orders by stale or caller-supplied ownership context.
- Rule: corporation order payloads remain marked as corporation data and are not converted into character-owned order projections at this transport boundary.
- Validation: `server/__tests__/corporation_esi_gateway.test.ts` and `server/__tests__/character_routes_contract.test.ts`.


## ESI-DATA-STATE-001 — Collection state is explicit

- Scope: character orders, order history, wallet transactions and wallet journal returned by `EsiService`.
- Rule: `AVAILABLE` means a valid collection payload with at least one row.
- Rule: `EMPTY` means a valid successful collection payload with zero rows.
- Rule: `PARTIAL` means the upstream explicitly reports a partial collection result; it is not equivalent to complete data.
- Rule: `UNAVAILABLE` represents missing fresh payload semantics such as 304/204 or missing credentials.
- Rule: `ERROR` represents a failed transport or HTTP request.
- Rule: `ERROR` and `UNAVAILABLE` must never be silently converted to `[]` by collection consumers.
- Rule: `requireUsableCollection` may only release `AVAILABLE` and `EMPTY` data to business consumers.
- Validation: `src/services/__tests__/esi.test.ts`, `useCharacterSync` and `MyOrdersView` consumer paths, full ESI/API/build CI.
