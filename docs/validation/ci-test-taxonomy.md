# CI-001E — Test taxonomy and canonical ownership

Status: ACTIVE — CI-001E
Date: 2026-09-23
Scope: test ownership, certification taxonomy and duplication control
Parent: [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
Source: `package.json`, test directories and current CI topology

## Rule

A test file has one **canonical owner**. A test may have multiple **secondary triggers** when another lane needs to run it for a specific decision, but this does not create a second ownership.

No test is deleted or excluded by this document.

## Certification levels

| Level | Purpose | Current CI surface |
|---|---|---|
| Fast | structural signal during iteration | `static` |
| Certification | complete proof for a ready PR | `unit_domain` + `server` + `browser-e2e` + SDE when sensitive |
| Full | exhaustive repository coherence | existing full command set, to be formalized in CI-001H |

## Canonical ownership

### Engine / domain

Canonical owner: `npm test` / `unit_domain`.

`src/engine/__tests__/` files:

- `catalog_integrity.test.ts`
- `catalog_universe_truth.test.ts`
- `character_transaction_ingestion.test.ts`
- `character_transaction_persistence.test.ts`
- `corporation_order.test.ts`
- `data_contracts_and_provenance.test.ts`
- `domain_repositories.test.ts`
- `end_to_end_integration.test.ts`
- `engine.test.ts`
- `evidence_chain.test.ts`
- `execution_correlation.test.ts`
- `execution_outcome.test.ts`
- `execution_simulation.test.ts`
- `execution_tracking_integration.test.ts`
- `financial_config.test.ts`
- `financial_engine.test.ts`
- `fleet.test.ts`
- `fleetFinancial.test.ts`
- `fleetFinancialContractHardening.test.ts`
- `interregional_purity.test.ts`
- `interregional_route_resolution.test.ts`
- `market_data_quality.test.ts`
- `market_outcome_tracking.test.ts`
- `observation_provenance_and_audit.test.ts`
- `opportunity_certification_pillars.test.ts`
- `orderOperations.test.ts`
- `order_identity.test.ts`
- `order_scoping_contracts.test.ts`
- `property_invariants.test.ts`
- `realized_financial_outcome.test.ts`
- `route_engine.test.ts`
- `scoring_and_prediction.test.ts`
- `security_and_advisory.test.ts`
- `systemic_certification.test.ts`
- `treasury.test.ts`
- `type_catalog.test.ts`

Note: `test:truth` is a secondary trigger for `catalog_universe_truth.test.ts`; it does not create a second canonical owner.

### Server / API / security / ESI

Canonical owners are the dedicated server scripts executed by `server`:

| Test file | Canonical script |
|---|---|
| `server/__tests__/api_integration.test.ts` | `test:api` |
| `server/__tests__/character_routes_contract.test.ts` | `test:api` |
| `server/__tests__/auth_token_validation.test.ts` | `test:auth-token` |
| `server/__tests__/character_esi_gateway.test.ts` | `test:esi` |
| `server/__tests__/corporation_esi_architecture.test.ts` | `test:esi` |
| `server/__tests__/corporation_esi_gateway.test.ts` | `test:esi` |
| `server/__tests__/esi_gateway.test.ts` | `test:esi` |
| `server/__tests__/esi_hardening.test.ts` | `test:esi` |
| `server/__tests__/market_esi_gateway.test.ts` | `test:esi` |
| `server/__tests__/runtime_config.test.ts` | `test:config` |
| `server/__tests__/security_hardening.test.ts` | `test:security` |
| `server/__tests__/server_smoke.test.ts` | `test:smoke` |

### Corporation boundary specialization

`server/__tests__/corporation_esi_gateway.test.ts`, `corporation_esi_architecture.test.ts` and `character_routes_contract.test.ts` retain their server-side canonical ownership above.

`src/services/__tests__/corporationTreasurySync.test.ts` is the only file currently unique to `test:corporation-boundary`.

The remaining files invoked by `test:corporation-boundary` are known overlaps:

- `financial_config.test.ts` → canonical engine owner;
- `treasury.test.ts` → canonical engine owner;
- `corporation_esi_gateway.test.ts` → canonical ESI owner;
- `character_routes_contract.test.ts` → canonical API owner;
- `corporation_esi_architecture.test.ts` → canonical ESI owner.

These are **not removed in CI-001E yet**. The next safe step is to introduce a unique boundary script/trigger for `corporationTreasurySync.test.ts`, prove the replacement on PR + Full, then remove only the redundant invocations.

## Demonstrated overlaps carried into E

| Existing overlap | Canonical owner | Secondary trigger today | CI-001E decision |
|---|---|---|---|
| `financial_config.test.ts` | `npm test` | `test:corporation-boundary` | retain until unique trigger is proven |
| `treasury.test.ts` | `npm test` | `test:corporation-boundary` | retain until unique trigger is proven |
| `character_routes_contract.test.ts` | `test:api` | `test:corporation-boundary` | retain until ownership refactor is proven |
| `corporation_esi_gateway.test.ts` | `test:esi` | `test:corporation-boundary` | retain until ownership refactor is proven |
| `corporation_esi_architecture.test.ts` | `test:esi` | `test:corporation-boundary` | retain until ownership refactor is proven |
| `catalog_universe_truth.test.ts` | `npm test` | `test:truth` | retain; truth trigger is explicit evidence surface |

## Safe deduplication protocol

For any overlap:

1. identify the invariant;
2. identify one canonical owner;
3. create/verify a unique replacement trigger when a secondary domain needs a signal;
4. run the canonical owner on every required certification level;
5. compare observable proof before removal;
6. remove only the redundant invocation, never the test file.

A failure in the replacement proof blocks deletion.

## Flaky policy

A failure that disappears on retry is not automatically classified as flaky.

Required classification:

- deterministic product/test failure;
- environment/setup failure;
- infrastructure/transient failure;
- genuine flake.

A flaky test may be isolated only with an explicit owner, reason, diagnostic artifact and re-entry condition. Blanket retry is not an acceptable substitute for repair.

## E exit gate

CI-001E is complete only when:

- every test file has one canonical owner;
- Fast / Certification / Full triggers are explicit;
- known overlaps have a written decision;
- no test is silently removed from certification;
- any redundant invocation removed has a replacement-proof reference;
- flaky handling is documented and observable.
