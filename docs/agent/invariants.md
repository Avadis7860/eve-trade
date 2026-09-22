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
