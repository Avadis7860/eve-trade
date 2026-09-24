# UX-03 — Data Availability & Derivation Matrix

Status: CURRENT / CONTRACT SUPPORT
Base main: `aec4c62691723e8fa2ee2bb2f9126249152ad57f`
Branch: `ux-03/allocation-contract`

## Purpose

This document separates:

1. facts already available from ESI or existing repository state;
2. values that can be deterministically derived from existing facts;
3. aggregates/view models that UX-03 must implement;
4. facts that are genuinely unavailable until another domain is added.

The rule is:

> A new UI field does not automatically require a new ESI integration. First identify whether its source fact already exists and whether UX-03 only needs a deterministic transformation.

## Status vocabulary

| Status | Meaning |
|---|---|
| FACT | source fact already exists in current code/data |
| DERIVED | deterministic calculation from existing facts |
| AGGREGATED | new application view/model combining existing facts |
| NEW SOURCE | requires a new ESI acquisition/integration |
| POLICY | value does not come from EVE/ESI; requires explicit product configuration |

## Allocation / Portfolio matrix

| UX-03 datum | Status | Existing source | Transformation required | First-increment decision |
|---|---|---|---|---|
| Character wallet balance | FACT | `EveCharacterSession.wallet_balance` / character wallet sync | scope + freshness | Use |
| Corporation division balance | FACT | `corporation_divisions[].balance` | select division + provenance | Use |
| Treasury source mode | FACT | `FinancialConfig.treasury_source_mode` | resolve effective scope | Use |
| Effective trading capital | FACT | `TreasuryEngine.resolveEffectiveCapital()` | expose provenance | Use |
| Capital status | FACT | `TreasuryResolution.capital_status` | map to UI health | Use |
| Active orders | FACT | character/corporation ESI order sync | scope by economic owner | Use |
| Order escrow | FACT | `EveCharacterOrder.escrow` | aggregate buy escrow | Use |
| Remaining order quantity | FACT | `volume_remain` | none | Use |
| Initial order quantity | FACT | `volume_total` | none | Use |
| Fill ratio | DERIVED | order quantities | `1 - remain / total` | Use |
| Order age | DERIVED | `issued`, `duration` | `getOrderTiming()` | Use |
| Remaining order duration | DERIVED | `issued`, `duration` | `getOrderTiming()` | Use |
| Buy obligation | DERIVED | `price`, `volume_remain` | `price × remain` | Use as diagnostic |
| Uncovered buy obligation | DERIVED | obligation + escrow | `max(0, obligation - escrow)` | Use as diagnostic |
| Sell exposure | DERIVED | sell order price + remain | remaining sell notional | Use as inventory exposure, not cash |
| Order economic owner | FACT | `ownership` | scope/aggregation | Use |
| Observing principal | FACT | `ownership.principal_character_id` | separate from owner | Use |
| Corporation wallet division | FACT | `ownership.wallet_division` | scope filter | Use |
| Order market distance | DERIVED | order + market book | `getOrderMarketDistance()` | Use |
| Inventory quantity | NEW SOURCE | Character Assets ESI | new authenticated Assets integration | Defer |
| Inventory location | NEW SOURCE | Character Assets ESI | asset aggregation/location resolution | Defer |
| Inventory cost basis | AGGREGATED | transactions + execution/FIFO domain, subject to coverage | aggregate remaining lots | Use only when authoritative match exists |
| Inventory market value | DERIVED | inventory quantity + market data | price valuation + health | Defer until inventory source exists |
| Explicit operational reserve | POLICY | none today | new Control Center field | Default absent/0 until configured |
| Allocation budget | DERIVED | treasury cash + reserve | `max(0, cash - reserve)` | Use |
| Cross-item candidate universe | FACT/AGGREGATED | `GlobalMarketSyncService.getUniverseOpportunities()` + persisted opportunities | hydrate + expose coverage/scope | Use |
| Candidate universe coverage | AGGREGATED | global sync progress + candidate set | FULL/BOUNDED/PARTIAL/UNKNOWN | Use |
| Opportunity viability | FACT | `is_viable` | eligibility gate | Use |
| Opportunity actionability | FACT | `certification.is_actionable` | eligibility gate | Use |
| Market health | FACT | `MarketDataQuality` | aggregate source/destination health | Use |
| Projected net profit | FACT | `costs.net_profit` | display only | Use |
| Projected ROI | FACT | `costs.roi` | display only | Use |
| Capturable profit | FACT | `capturable_profit` | display only | Use |
| Profit/day | FACT | `profit_per_day` | display only | Use |
| Expected days to sell | FACT | `expected_days_to_sell` | display only | Use |
| Liquidity evidence | FACT | `TradeLiquidityMetrics` + history | aggregate display/rationale | Use |
| Prediction forecast | FACT | `PredictionForecast` when available | display with coverage label | Use when present |
| Prediction confidence | FACT | `prediction.prediction_confidence` | do not merge with data confidence | Use |
| Profit realization probability | FACT | `prediction.profit_realization_probability` | optional forecast metric | Use when present |
| Data confidence | FACT | `data_quality.overall_confidence` | display separately | Use |
| Overall score | FACT | `scores.overall_score` | ranking aid only | Use as secondary signal |
| Type concentration | DERIVED | allocation positions + type_id | deployed-capital denominator | Correct in optimizer |
| Group concentration | DERIVED | allocation positions + group_id | deployed-capital denominator | Correct in optimizer |
| Category concentration | DERIVED | allocation positions + category_id | display unless policy cap exists | Use |
| Route concentration | DERIVED | allocation positions + route | display unless policy cap exists | Use |
| Allocation rationale | AGGREGATED | eligibility, constraints, metrics | structured decision explanation | Implement |
| Unallocated capital reason | AGGREGATED | optimizer rejection/constraints | categorized reason codes | Implement |
| Portfolio data health | AGGREGATED | treasury + candidate + market states | surface-level health | Implement |
| Proposed allocation freshness | AGGREGATED | candidate detection timestamps + refresh state | snapshot state | Implement |

## What is not required for the first UX-03 implementation

The first increment does **not** need:

- a new ESI market acquisition route;
- a new wallet acquisition route;
- a new order acquisition route;
- a new corporation credential;
- a new Assets endpoint integration;
- a new financial truth engine;
- a new prediction engine.

The primary work is aggregation, scope resolution, allocation logic and truthful UI presentation.

## New-source boundary

Character Assets are the only major missing economic source identified for a fully authoritative inventory view.

ESI supports authenticated character Assets and CCP's current developer documentation continues to list Assets as a first-class ESI client capability. This repository does not yet integrate that route into the Portfolio domain.

Therefore UX-03 must not silently fabricate inventory completeness.

## Important timing/caching distinction

Current ESI architecture includes both route caching and pagination. Market orders are explicitly rate-limited and cached for five minutes; the repository already carries page counts and data-health metadata.

Therefore a UX-03 allocation snapshot is a **decision-time view over observed candidate evidence**, not a promise that every candidate has an independently fresh request at the exact instant of display.

The contract must expose candidate coverage/freshness rather than imply impossible real-time global omniscience.

## Consequence for implementation

The implementation sequence should be:

1. build a typed portfolio/treasury aggregation boundary;
2. consume the existing universe-wide opportunity set;
3. correct PortfolioOptimizer invariants;
4. expose Proposed Allocation snapshot/rationale;
5. expose Real Portfolio with explicit inventory coverage;
6. add browser/domain scenarios;
7. consider Assets integration only as a subsequent, separately scoped increment.

## Evidence references

- Repository treasury boundary: `src/engine/treasury.ts`
- Repository order scope: `src/types/character.ts`, `src/engine/orderOperations.ts`
- Repository global opportunities: `src/services/globalMarketSync.ts`
- Repository opportunity contracts: `src/types/opportunity.ts`
- Repository market quality: `src/types/market.ts`
- Repository optimizer: `src/engine/portfolio.ts`
- CCP ESI overview: https://developers.eveonline.com/docs/services/esi/overview/
- CCP ESI TypeScript examples for wallet, Assets and market orders: https://developers.eveonline.com/docs/community/eve-api-for-typescript/
- CCP market-order rate limiting: https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- CCP ESI pagination: https://developers.eveonline.com/docs/services/esi/pagination/x-pages/
