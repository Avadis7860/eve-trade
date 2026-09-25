# UX-03 — Data Availability & Derivation Matrix

Status: CURRENT / TASK-02 COMPLETE
Validated on current main baseline: `af725a60693b60a55895c75feb7dc57bfd0c36b9`
Task: UX-03 / TASK-02 — issue #86 (completed)
Historical reference: `archive/ux-03-allocation-contract-2026-09-24`

## Purpose

This matrix replaces the archive-only UX-03 data-availability matrix as the current validation reference.

The objective is to identify, for each Portfolio / Allocation datum:
- whether the underlying source fact already exists on current main;
- whether the datum is a deterministic derivation or an application aggregate;
- whether it is policy rather than EVE/ESI truth;
- whether it crosses a genuine new-source boundary;
- which freshness, coverage, health and provenance constraints must remain visible.

No product implementation or new ESI acquisition route is introduced by TASK-02.

## Classification vocabulary

| Status | Meaning |
|---|---|
| FACT | Authoritative or directly observed repository/source datum already present on current main. |
| DERIVED | Deterministic calculation from current facts, configuration or observed market data. |
| AGGREGATED | Application view/model combining multiple current facts or derived values. |
| NEW SOURCE | Requires a source/acquisition boundary not present on current main. |
| POLICY | Explicit product/operator choice; not an EVE/ESI fact. |

## Current-main matrix

| UX-03 datum | Status | Current-main source | Required derivation / aggregation | First-increment decision |
|---|---|---|---|---|
| Treasury source selection | POLICY | `FinancialConfig.treasury_source_mode` | Resolve one declared treasury scope; do not silently merge scopes. | Use as policy |
| Character wallet balance | FACT | `EveCharacterSession.wallet_balance`; character wallet sync | Preserve observation freshness and principal/scope. | Use |
| Corporation wallet division balance | FACT | `corporation_divisions[].balance` from corporation wallet sync | Select declared division; preserve corporation provenance and observer principal. | Use when ESI-observed |
| Fleet consolidated wallet | AGGREGATED | linked character wallet balances | Sum only the declared fleet scope; retain component provenance and partial availability. | Use with coverage |
| Manual budget | POLICY | `FinancialConfig.available_capital` in `manual_budget` mode | Label `MANUAL / SIMULATION`; never present as observed treasury cash. | Use as simulation only |
| Effective trading capital | DERIVED | `TreasuryEngine.resolveEffectiveCapital()` + configured/observed source | Resolve usable capital plus source status; `capital_status` is mandatory context. | Use with status |
| Treasury capital status | DERIVED | treasury source and availability | `observed_esi`, `manual` or `unavailable`. | Use |
| Explicit operational reserve | POLICY | UX contract / future Control Center policy | No first-class reserve field/consumer is present in the current FinancialConfig; do not invent observed reserve cash. | Defer to policy owner |
| Allocation budget | DERIVED | effective capital + explicit reserve policy when one exists | `capital eligible for new proposal`; must not treat unavailable capital as observed zero. | Use only with valid source state |
| Active personal orders | FACT | ESI character active-order collection | Normalize ownership, principal, timestamps and health. | Use |
| Active corporation orders | FACT | ESI corporation order collection observed by authenticated character | Preserve corporation owner, observer and issuer separately. | Use |
| Order escrow | FACT | `EveCharacterOrder.escrow` when supplied by ESI | Per-order amount remains provenance-bearing. | Use |
| Aggregate buy escrow | DERIVED | active orders + per-order escrow | Sum only observed buy-order escrow within the selected scope. | Use |
| Order remaining quantity | FACT | `volume_remain` | None. | Use |
| Order initial quantity | FACT | `volume_total` | None. | Use |
| Order fill ratio | DERIVED | `volume_total` + `volume_remain` | `1 - remain / total`, with conservative validation. | Use |
| Order age / remaining duration | DERIVED | `issued` + `duration` | `getOrderTiming()`-style timing derivation. | Use |
| Buy order obligation | DERIVED | order price + remaining quantity | Remaining notional; not itself a cash-balance fact. | Use as diagnostic |
| Uncovered buy obligation | DERIVED | obligation + observed escrow | `max(obligation - observed escrow, 0)` only when both inputs are usable. | Use as diagnostic |
| Sell-order exposure | DERIVED | sell orders + price + remaining quantity | Remaining sell notional is exposure, not liquid cash. | Use as exposure |
| Order economic owner | FACT | `EveCharacterOrder.ownership.owner_type / owner_id` | Preserve owner identity exactly; do not rewrite ownership for presentation. | Use |
| Observing principal | FACT | `ownership.principal_character_id` and observers | Keep observation principal distinct from economic owner. | Use |
| Order issuer | FACT | `ownership.issuer_character_id` when supplied | Optional provenance only; absence is not an alternative issuer fact. | Use when present |
| Accounting scope | POLICY | `accounting_scope_id` in Financial Truth; explicit scope selection | Scope is contractual; character/corporation identity does not automatically define it. | Use explicitly |
| Wallet transaction fact | FACT | `EveCharacterTransaction` / `PersistedCharacterTransaction` | Preserve source, transaction ID, principal and ingestion state. | Use |
| Acquisition lot | AGGREGATED | Financial Truth reconstruction from transaction facts | Deterministic causal FIFO lineage; not a raw ESI fact. | Use via Financial Truth |
| Disposal allocation | AGGREGATED | Financial Truth reconstruction from transaction facts | Match disposal quantity to causally prior acquisition lots. | Use via Financial Truth |
| CurrentPosition / position segments | AGGREGATED | `positionLedger` / `CurrentPosition` | Reconstructed economic position with lifecycle, cost basis, coverage and provenance. | Use |
| Position lifecycle | DERIVED | CurrentPosition quantities and causal lineage | `OPEN -> PARTIALLY_REALIZED -> CLOSED`; closure only at zero causally known remaining quantity. | Use |
| Capital recovery | DERIVED | CurrentPosition capital committed + cash recovered | Recovery delta/ratio/state is distinct from realized P&L. | Use as separate metric |
| Whole-operation profitability | DERIVED | Financial Truth position outcome | Closure-gated; partial disposal profitability must not become whole-operation profitability. | Use only when eligible |
| Inventory quantity | NEW SOURCE | Character Assets ESI is not integrated on current main | No synthetic quantity and no zero fallback. | Defer |
| Inventory location | NEW SOURCE | Character Assets/location evidence is not integrated on current main | No authoritative location claim without asset evidence. | Defer |
| Inventory cost basis | AGGREGATED | remaining `AcquisitionLot` cost basis / Financial Truth | Applies only to known reconstructed economic positions; does not establish physical inventory completeness. | Use with coverage |
| Inventory market value | DERIVED | inventory quantity + current market observation | Cannot be authoritative while inventory quantity coverage is missing; market freshness/health remains separate. | Defer authoritative view |
| Persisted market observation | FACT | `MarketObservation` / market data store | Preserve captured time, source, confidence, page coverage and health. | Use |
| Market price / visible depth | FACT | market observation / current market snapshot | Observation fact for the captured snapshot, not realized financial truth. | Use |
| Market freshness | DERIVED | market fetch timestamps + cache state | Keep `fresh`, `recent`, `stale`, `expired`, `unknown` distinct. | Use |
| Market health / completeness | DERIVED | `MarketDataQuality` / `DataProvenance` | Preserve LIVE/CACHE/STALE/PARTIAL/UNKNOWN/ERROR and complete/partial/empty/unknown. | Use |
| Cross-item candidate universe | AGGREGATED | `GlobalMarketSyncService.getUniverseOpportunities()` | Aggregate independently discovered opportunities across the declared scan scope. | Use |
| Candidate-universe coverage | AGGREGATED | global sync progress + discovered candidate set | Express FULL/PARTIAL/UNKNOWN only when justified by scan evidence. | Use |
| Opportunity viability | DERIVED | opportunity economics + validation state | `is_viable` is a computed eligibility result, not an ESI fact. | Use |
| Opportunity actionability | DERIVED | certification / evidence state | `certification.is_actionable` depends on source quality and domain validation. | Use |
| Projected net profit | DERIVED | market observations + financial fee/config model | Prospective model output; never realized P&L. | Use with projected label |
| Projected ROI | DERIVED | projected profit + declared capital denominator | Prospective metric with explicit denominator/scope. | Use with projected label |
| Capturable profit | DERIVED | opportunity economics + liquidity/friction model | Prospective amount after capture assumptions; not a probability. | Use with projected label |
| Profit per day | DERIVED | capturable profit + expected days | Prospective time-efficiency measure; not realized daily P&L. | Use with projected label |
| Expected days to sell | DERIVED | liquidity / historical market evidence | Modelled expectation from observed history/depth. | Use with projected label |
| Liquidity evidence | AGGREGATED | `TradeLiquidityMetrics` + market history/observations | Combine depth, turnover and historical volume without implying certainty. | Use |
| Prediction forecast | DERIVED | `PredictionEngine` / `PredictionForecast` | Statistical model output over observed features; never an observed fact. | Use when present |
| Prediction confidence | DERIVED | prediction model/history depth | Must remain distinct from data confidence. | Use when present |
| Data confidence | DERIVED | market quality + evidence inputs | `overall_confidence` describes evidence quality, not predicted profitability. | Use separately |
| Portfolio concentration by type | DERIVED | proposed positions + `type_id` | Deployed proposed capital denominator. | Use |
| Portfolio concentration by group | DERIVED | proposed positions + `group_id` | Deployed proposed capital denominator. | Use |
| Portfolio concentration by category | DERIVED | proposed positions + category | Display metric unless a policy cap exists. | Use as diagnostic |
| Portfolio concentration by route | DERIVED | proposed positions + route | Display metric unless a policy cap exists. | Use as diagnostic |
| Allocation rationale | AGGREGATED | eligibility, constraints, projected metrics and policy | Structured explanation of why a proposal is shaped as shown. | Use |
| Unallocated-capital reason | AGGREGATED | allocator rejection/constraint evidence | Categorize reserve, no eligibility, concentration, minimum size, insufficient capital or unsafe data/route. | Use |
| Real Portfolio snapshot | AGGREGATED | treasury + active orders + Financial Truth + available inventory evidence | Separate committed exposure from liquid capital and preserve coverage. | Use |
| Proposed Allocation snapshot | AGGREGATED | treasury scope + cross-item opportunities + policy + optimizer | Prospective recommendation; never a realized financial result. | Use |
| Proposed Allocation freshness | AGGREGATED | candidate detection times + refresh state | Show snapshot freshness; do not imply globally real-time evidence. | Use |
| Provenance bundle | AGGREGATED | source metadata on current facts and derived outputs | Preserve `source_kind + source_id + principal_scope`, plus accounting scope, owner, observer, issuer, freshness, health and coverage. | Mandatory |

## Reclassifications from the archived matrix

The archived matrix is useful historical evidence but is not current truth. The current-main revalidation changes several important classifications:

1. **Effective trading capital is `DERIVED`, not `FACT`.** The underlying wallet/division balance may be factual, but `TreasuryEngine.resolveEffectiveCapital()` is a resolution step and its status must travel with the numeric result.
2. **CurrentPosition, acquisition lots and disposal allocations are `AGGREGATED` reconstructed outputs.** They are authoritative calculations of Financial Truth when their evidence is sufficient, not direct ESI facts.
3. **Projected and predictive metrics are `DERIVED`, not `FACT`.** Net profit, ROI, capturable profit, profit/day, expected days, prediction forecast and confidence values are outputs of current market/config/model inputs.
4. **Market health, freshness and confidence are quality states, not economic facts.** They are derived from acquisition metadata and must remain independent from quantity or financial value.
5. **Viability and actionability are computed eligibility states.** They are not new ESI facts and must not be used to hide the quality limitations of their inputs.
6. **The allocation budget is `DERIVED`, while reserve remains `POLICY`.** Current main has no first-class operational-reserve field/consumer in `FinancialConfig`; the contract must not fabricate one.

## Coverage and failure semantics

The following axes remain independent:

- history coverage;
- economic-origin coverage;
- source coverage;
- financial completeness;
- freshness;
- acquisition/market health;
- candidate-universe coverage;
- prediction confidence;
- data confidence.

Never collapse:

`UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE / STALE`

into a numeric zero, an empty business collection, or synthetic cost.

A failed collection must stay a failed/degraded collection. A valid empty collection is a different state.

## Provenance and scope contract

Observed financial and allocation inputs must remain traceable through:

`source_kind + source_id + principal_scope`

Where applicable, also preserve:

- accounting scope;
- economic owner;
- observing principal;
- issuer;
- order ID as order provenance/correlation only;
- freshness;
- health;
- coverage.

Character, corporation, issuer and observer are attribution/provenance dimensions. They are not automatic accounting silos.

`MarketOrder.is_buy_order` is a market-mechanism fact and must never be used as economic acquisition/disposition direction.

## No-new-source boundary

TASK-02 creates no new ESI source.

The only material missing source identified for an authoritative Real Portfolio inventory view is Character Assets. Until that boundary is separately implemented and certified, inventory quantity/location remain `NEW SOURCE` and UNKNOWN/PARTIAL rather than zero.

All other first-increment Allocation data reviewed here can be supplied by existing current-main domains, deterministic derivation or aggregation.

## Implementation implications

TASK-02 does not authorize product code changes. Before the future UX-03 implementation chantier:

- treasury resolution must be consumed together with its source/status semantics;
- the allocator must consume the declared treasury scope rather than silently assuming a generic `available_capital` bucket; current `PortfolioOptimizer` still initializes its budget directly from `FinancialConfig.available_capital`, so this is an implementation alignment gate, not evidence that the resolved treasury is already wired through;
- CurrentPosition / Financial Truth outputs must remain coverage-aware;
- the cross-item universe must carry its scan coverage;
- projected and predictive values must remain visibly prospective;
- Real Portfolio and Proposed Allocation must stay separate;
- Character Assets must remain a separately scoped source addition;
- numeric fallback fields in evidence/projection serializers must not be interpreted as proof of an observed zero when the originating state is UNKNOWN, PARTIAL, ERROR or UNAVAILABLE.

## Evidence checked on current main

- `docs/ux/ux-03-allocation-contract.md`
- `docs/contracts/financial.md`
- `docs/contracts/orders.md`
- `docs/contracts/esi.md`
- `docs/invariants/data-semantics.md`
- `docs/invariants/esi-data-state.md`
- `docs/invariants/corporation-boundary.md`
- `docs/invariants/financial-safety.md`
- `src/types/financial.ts`
- `src/types/character.ts`
- `src/types/opportunity.ts`
- `src/types/market.ts`
- `src/engine/treasury.ts`
- `src/engine/positionLedger.ts`
- `src/engine/portfolio.ts`
- `src/services/esi.ts`
- `src/services/globalMarketSync.ts`

Archive material remains historical evidence only. No archived implementation is imported by TASK-02.
