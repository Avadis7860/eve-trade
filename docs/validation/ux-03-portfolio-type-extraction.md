# UX-03 — TASK-03 — Portfolio Typed Model Extraction

Status: CURRENT / TASK-03 ACTIVE
Base main: `0f822077a43a03ea17098e1b35e25f8374487888`
Historical reference: `archive/ux-03-allocation-contract-2026-09-24`
Issue: #87

## Purpose

Re-extract the Portfolio data contract from the current `main` after TASK-01 (business contract) and TASK-02 (Data Availability & Derivation Matrix).

The archive is evidence of the historical requirements only. Its `src/types/portfolio.ts` is not an implementation source.

This task deliberately separates:

- canonical domain truth already owned by Financial Truth, Treasury, Orders, Market and Opportunity;
- Portfolio-level composition required to present Real Portfolio and Proposed Allocation;
- policy/projection fields that must not be mistaken for observed facts.

## Extraction rule

Each archived field receives:

- a current-main source, when one exists;
- a data classification: FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY;
- a migration decision:
  - KEEP = concept remains valid in Portfolio;
  - REPLACE = use an existing canonical main type;
  - ADAPT = keep the concept but redesign its shape around current main;
  - DROP = no longer belongs in the Portfolio contract.

## Field-by-field extraction matrix

### 1. Universe state vocabulary

| Archive element | Current-main source | Class | Decision | Reason |
|---|---|---|---|---|
| `PortfolioUniverseCoverage` | `GlobalSyncProgress` + candidate universe | AGGREGATED | ADAPT | Coverage remains necessary, but Portfolio must derive it from actual scan evidence. |
| `PortfolioUniverseState` | Market/ESI state + `GlobalSyncProgress` | DERIVED | ADAPT | Keep explicit READY/EMPTY/PARTIAL/UNKNOWN/STALE/ERROR semantics; do not make a failed acquisition look empty. |
| `PortfolioUnallocatedReasonCode` | Portfolio policy + allocator diagnostics | POLICY / AGGREGATED | KEEP/ADAPT | Useful Portfolio explanation vocabulary; it is not ESI truth. |

### 2. `PortfolioUnallocatedReason`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `code` | policy/allocator diagnostics | POLICY | KEEP |
| `amount` | allocator result | DERIVED | KEEP |
| `count` | allocator rejection aggregation | AGGREGATED | KEEP |
| `detail` | Portfolio rationale | AGGREGATED | KEEP |

The reason object belongs to Proposed Allocation because it explains a proposal outcome. It must not rewrite source data as unavailable.

### 3. `PortfolioTreasurySnapshot`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `source_mode` | `TreasuryResolution.source_mode` | DERIVED | REPLACE |
| `source_kind` | treasury source configuration/status | DERIVED | ADAPT |
| `source_id` | Portfolio/Treasury provenance context | FACT metadata | ADAPT |
| `principal_scope` | treasury observation principal | FACT metadata | ADAPT |
| `label` | `TreasuryResolution.label` | DERIVED | REPLACE |
| `treasury_cash` | wallet/treasury source evidence | FACT | ADAPT |
| `policy_reserve` | no canonical active reserve consumer on main | POLICY | DROP from first contract |
| `reserve_configured` | no canonical active reserve consumer on main | POLICY | DROP from first contract |
| `allocation_budget` | Treasury resolution + future reserve policy | DERIVED | ADAPT |
| `capital_status` | `TreasuryResolution.capital_status` | DERIVED | REPLACE |
| `data_health` | source-specific acquisition state | DERIVED | ADAPT |
| `is_simulation` | manual budget mode | DERIVED | KEEP |

Important: `TreasuryResolution.effective_capital` remains canonical. Portfolio must not create a competing capital resolution. A Treasury provenance wrapper is needed because the current `TreasuryResolution` does not itself carry the complete source/provenance tuple required by UX-03.

No reserve field is invented in TASK-03.

### 4. `PortfolioOrderExposureSnapshot`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `order_count` | `EveCharacterOrder[]` | DERIVED | KEEP |
| `buy_order_count` | `EveCharacterOrder.is_buy_order` | FACT aggregated | KEEP |
| `sell_order_count` | `EveCharacterOrder.is_buy_order` | FACT aggregated | KEEP |
| `buy_escrow` | per-order `escrow` | DERIVED | KEEP |
| `buy_obligation` | price × remaining quantity | DERIVED | KEEP |
| `uncovered_buy_obligation` | obligation - observed escrow | DERIVED | KEEP |
| `sell_exposure` | sell order observations | DERIVED | KEEP |
| `data_health` | order acquisition/scoping state | DERIVED | ADAPT |
| `missing_escrow_count` | order evidence | DERIVED | KEEP |
| `missing_provenance_count` | `OrderOwnership` / order evidence | DERIVED | KEEP |
| `scoped_order_ids` | canonical `OrderId` | FACT | REPLACE |
| `unresolved_corporation_order_count` | corporation order scope resolution | DERIVED | KEEP |
| `unresolved_corporation_order_ids` | canonical `OrderId` | FACT | REPLACE |
| `unresolved_corporation_order_notional` | order economics | DERIVED | KEEP |

Order IDs remain market-order identity/provenance only. They are never promoted to Portfolio/economic-operation identifiers.

### 5. `PortfolioCandidateUniverseSnapshot`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `candidate_count` | `UniverseWideOpportunity[]` | DERIVED | KEEP |
| `coverage` | `GlobalSyncProgress` + candidate evidence | AGGREGATED | ADAPT |
| `state` | candidate acquisition state | DERIVED | ADAPT |
| `data_health` | candidate source quality | DERIVED | ADAPT |
| `detected_at` | opportunity detection timestamps | FACT/AGGREGATED | KEEP |
| `selected_item_is_navigation_only` | UX-03 policy | POLICY | KEEP as invariant |
| `candidates` | `UniverseWideOpportunity[]` | AGGREGATED | REPLACE |

The selected catalog item is navigation context only. It must not constrain the allocation universe.

### 6. `PortfolioCapitalProvenance`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `source_kind` | Treasury source mode/status | DERIVED | ADAPT |
| `source_id` | treasury source identity | FACT metadata | KEEP |
| `principal_scope` | authenticated/observing principal | FACT metadata | KEEP |

Do not reuse `FinancialProvenance` for treasury records: its source-kind vocabulary is specifically financial transaction provenance. Portfolio therefore keeps a small treasury-source provenance type.

### 7. `PortfolioPositionRationale`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `rationale` | allocation explanation | AGGREGATED | KEEP |
| `expected_profit_basis` | policy/model selection | POLICY | KEEP |
| `forecast_supported` | prediction evidence | DERIVED | KEEP |

Prediction confidence and data confidence remain separate dimensions. A forecast is never an observed result.

### 8. `PortfolioRealInventorySnapshot`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `coverage` | Character Assets source boundary | NEW SOURCE | ADAPT |
| `quantity` | Character Assets | NEW SOURCE | ADAPT |
| `location_known` | Character Assets | NEW SOURCE | ADAPT |
| `market_value` | quantity + market observation | DERIVED | ADAPT |
| `cost_basis` | Financial Truth known-position basis | AGGREGATED | DROP as physical-inventory field |

TASK-03 does not introduce Character Assets. Physical inventory quantity/location therefore remain explicitly UNKNOWN/partial at this layer.

Known Financial Truth cost basis belongs to economic positions, not an invented authoritative physical inventory record.

### 9. `RealPortfolioSnapshot`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `treasury` | Treasury resolution | DERIVED composition | ADAPT |
| `orders` | Orders domain | FACT + DERIVED composition | ADAPT |
| `inventory` | Character Assets boundary | NEW SOURCE | ADAPT |
| `data_health` | composition of component states | DERIVED | ADAPT |
| `freshness` | component-specific freshness evidence | DERIVED | ADAPT |
| `is_authoritative_net_worth` | UX safety invariant | POLICY | KEEP as literal false |

Real Portfolio is a composition of already-known exposure. It is not a new accounting engine and cannot claim authoritative net worth without authoritative inventory coverage.

### 10. `ProposedAllocationSnapshot`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `treasury` | Treasury resolution | DERIVED | ADAPT |
| `candidate_universe` | global opportunity universe | AGGREGATED | ADAPT |
| `simulation` | existing `PortfolioSimulation` | DERIVED projection | REPLACE at contract boundary |
| `data_health` | candidate/evidence quality | DERIVED | ADAPT |
| `freshness` | candidate snapshot timing | DERIVED | ADAPT |
| `proposal_blocked` | evidence/policy gate | DERIVED | KEEP |
| `unallocated_capital` | budget - deployment | DERIVED | KEEP |
| `unallocated_within_budget` | allocator result | DERIVED | KEEP |
| `reserve_locked` | legacy reserve concept | POLICY | DROP from first contract |
| `unallocated_reasons` | allocator diagnostics | AGGREGATED / POLICY | KEEP |
| `position_rationales` | allocator explanation | AGGREGATED | KEEP |

The existing `PortfolioSimulation` remains a compatibility implementation type in `execution.ts`. TASK-03 does not make it the new source of truth for the Portfolio contract.

### 11. `PortfolioAggregationInput`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `config` | `FinancialConfig` | POLICY | ADAPT |
| `characters` | character domain | FACT | ADAPT |
| `active_character_id` | auth context | FACT | ADAPT |
| `orders` | order domain | FACT | ADAPT |
| `universe` | `UniverseWideOpportunity[]` | AGGREGATED | REPLACE |
| `global_sync_progress` | global market sync | AGGREGATED | ADAPT |

The input contract is implementation-facing. TASK-03 keeps it deliberately small and domain-oriented; it must not reproduce historical aggregation helpers whose semantics have changed.

### 12. `AllocationUniverseResolution`

| Field | Current-main source | Class | Decision |
|---|---|---|---|
| `opportunities` | global universe | AGGREGATED | REPLACE |
| `source` | fixed Portfolio boundary | POLICY | KEEP |
| `selected_item_type_id` | UI navigation context | POLICY | KEEP as navigation metadata only |

## Canonical types to reuse

The new Portfolio model must directly compose the following current-main authorities:

- `TreasuryResolution`;
- `OrderId`;
- `EveCharacterOrder` / `OrderOwnership`;
- `CurrentPosition`;
- `AcquisitionLot`;
- `DisposalAllocation`;
- `RealizedFinancialOutcome` where a realized view is required;
- `UniverseWideOpportunity`;
- `DataHealthStatus`;
- `DataState`;
- `DataProvenance`;
- financial coverage/completeness types.

No Portfolio type may silently recreate any of these authorities.

## Required Portfolio boundaries

### Real Portfolio

Must answer:

> What is already economically committed, and where is that exposure?

It may compose:

- resolved treasury;
- scoped active orders and order exposure;
- Financial Truth current positions;
- explicit inventory boundary.

It must not fabricate:

- net worth;
- physical inventory quantity/location;
- realized profit from market snapshots.

### Proposed Allocation

Must answer:

> Where can the declared available capital be deployed, given the currently evidenced opportunity universe and policy?

It may compose:

- resolved Treasury scope;
- independently discovered cross-item opportunities;
- projected allocation positions;
- diversification/concentration;
- unallocated capital and reasons;
- data/prediction evidence.

It must not become:

- an execution engine;
- a market scanner restricted to selected item;
- a realized-performance ledger.

## Semantic invariants

1. Economic direction comes from transaction facts. `MarketOrder.is_buy_order` is never accounting direction.
2. `order_id` is market-order identity/provenance only.
3. Character, corporation, issuer and observer remain distinct from accounting scope.
4. Cross-character Financial Truth requires an explicit common accounting scope.
5. `OPEN -> PARTIALLY_REALIZED -> CLOSED` remains canonical.
6. A partial disposal can have realized disposal P&L without being whole-operation profitability.
7. Whole-operation profitability is closure-gated.
8. Capital recovery is separate from realized P&L.
9. `UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE / STALE` never becomes synthetic numeric zero or empty business truth.
10. Market snapshot/projection is not realized financial truth.
11. Prediction confidence is not data confidence.
12. Character Assets remains a NEW SOURCE boundary.
13. Selected catalog item is navigation-only for allocation universe.
14. Treasury resolution must travel with its source/status context.
15. Freshness and health are distinct dimensions.

## Accepted extraction outcome

The archive contributes several useful UI/business concepts, especially explicit allocation diagnostics and separation of Real Portfolio / Proposed Allocation.

The following archive concepts are intentionally not carried forward:

- duplicate financial provenance structures;
- a second Treasury truth;
- first-class reserve fields without a canonical consumer;
- physical inventory claims without Character Assets;
- `PortfolioSimulation` as Portfolio truth;
- any order-ID-based economic operation identity;
- any coupling of freshness to health.

The next implementation step is a new minimal `src/types/portfolio.ts` built from this matrix, followed by type-contract tests. No UI or ESI implementation is authorized by this task.
