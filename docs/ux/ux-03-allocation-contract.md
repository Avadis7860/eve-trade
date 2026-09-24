# UX-03 — Allocation / Portefeuille — Contrat métier détaillé

Status: IMPLEMENTATION SCAFFOLD / FIN-001 + ORD-001 CERTIFIED / FIN-002 IN PROGRESS
Scope: UX-03 preparation, economic truth, opportunity universe, allocation semantics and validation
Base: `main` `aec4c62691723e8fa2ee2bb2f9126249152ad57f`
Related:
- [Trading Terminal — Surface Contracts](trading-terminal-surface-contracts.md)
- [Portfolio domain](../domains/portfolio.md)
- [UX Program](../roadmap/ux-program.md)
- [Known Gaps](../state/known-gaps.md)



## Contract reset — 2026-09-24

The existing UX-03 implementation is retained as scaffolding; the underlying order and position contracts are now certified, while broader UX-03 financial certification remains gated by FIN-002.

The financial model must explicitly separate:

1. market order observation;
2. economic transaction fact;
3. acquisition lot / open position;
4. realized disposal allocation;
5. prospective allocation/valuation.

A trader may acquire by taking an existing SELL order and later dispose through a SELL order. Market order side therefore cannot define accounting direction.

A disposal of 1 unit from an acquisition of 10,000 units may realize P&L on that 1 unit while leaving 9,999 units OPEN/PARTIALLY_REALIZED. UX-03 must never present that position as closed merely because a matched sale exists.

Real Portfolio certification is blocked by FIN-002 and the remaining data/UX acceptance gates.

### Progressive profitability of an economic operation — normative contract — 2026-09-24

An economic operation keeps its identity from the acquisition that creates its exposed quantity until the full quantity belonging to that operation is liquidated.

**Lifecycle and profitability are independent dimensions.**

- `OPEN` = no quantity has been disposed from the operation.
- `PARTIALLY_REALIZED` = some quantity has been disposed and some quantity remains economically exposed.
- `CLOSED` = the full quantity attributable to that operation has been disposed.

A partial disposal may therefore be profitable at the disposal-event level while the operation as a whole is still negative.

Canonical example:

`10,000 × 100 = 1,000,000 ISK` acquired, then `1 × 140 = 140 ISK` disposed.

- disposal result: `+40 ISK` before fees;
- capital initially committed: `1,000,000 ISK`;
- cumulative cash recovered: `140 ISK`;
- cumulative recovery delta: `-999,860 ISK`;
- remaining quantity: `9,999`;
- lifecycle: `PARTIALLY_REALIZED`;
- operation recovery state: still below recovery threshold.

The system must never infer whole-operation profitability from the isolated disposal result.

The cumulative operation-level recovery therefore tracks **all disposals already attributable to the same operation** against the **initial capital committed by that operation**. It is not recomputed from only the quantity sold by the latest disposal.

At any point the operation can be classified independently as:

- **NEGATIVE**: cumulative recovered capital is below initial capital committed;
- **RECOVERED**: cumulative recovered capital has reached the initial capital committed;
- **POSITIVE**: cumulative recovered capital exceeds initial capital committed.

This state may coexist with `PARTIALLY_REALIZED`. For example, after approximately `7,143 × 140 = 1,000,020 ISK` of cumulative disposals against the canonical `1,000,000 ISK` acquisition, the operation remains `PARTIALLY_REALIZED` with `2,857` units exposed, while the capital-recovery delta is positive.

The product must therefore distinguish, and never substitute one for another:

- disposal P&L;
- cumulative operation recovery;
- operation recovery state;
- lifecycle;
- remaining exposure;
- whole-operation closed result/ROI;
- financial completeness.

A **closed-position KPI** may still require the genuine `CLOSED` boundary. That does not prevent the system from showing progressive recovery before closure.

### Accounting lineage rule for the operation

An operation is not defined by the existence of a BUY order.

The accounting lineage must instead be built from economic transaction facts and their causally attributable acquisition/disposal quantities. A trader may acquire by taking an existing SELL order and later dispose through a SELL order created by the trader.

Therefore:

- `MarketOrder.is_buy_order` is observation/provenance only;
- the presence of a trader BUY order is not proof of acquisition intent;
- the absence of a trader BUY order is not proof that no acquisition occurred;
- sales must be attached to the economic operation through the actual transaction/position lineage available to the system;
- a new acquisition after an operation is fully liquidated begins a new operation rather than extending the closed one.

### Performance semantic boundary — FIN-002

The Performance projection now keeps disposal-level and whole-position semantics separate. A partial disposal can expose a positive realized sub-result while the position remains `PARTIALLY_REALIZED`; it does not count as a closed trade. When the position finally closes, the closing record may expose the cumulative whole-position result/ROI, and closed-position KPIs use that cumulative result.

Financial quality axes are also independent: `source_coverage` describes economic cost-lineage coverage, while `financial_completeness` describes the availability/evidence of the financial result, including fees. A `MARKET_TRACEABLE` position may therefore be `UNAVAILABLE` for fees and still reach `CLOSED` when its remaining quantity reaches zero. Fee availability must never suppress lifecycle closure.

## E2E findings — 2026-09-24

The first manual E2E pass identified two UI contract adjustments that do not change financial truth.

### Operations — corporation orders in character workflows

A corporation-owned order may legitimately be observed by a character and may also expose an issuer character. The UI must not require economic ownership to be personal before allowing that order into the character's operational hub workflow.

The target behavior is:

- ownership remains `corporation`;
- observer/authenticated principal remains the character who obtained the observation;
- issuer remains distinct when ESI exposes it;
- a character operational view may surface the corporation order when the character is an eligible observer or issuer;
- the corporation view continues to provide the complete economic-owner scope.

This is a presentation/operational projection, not an ownership rewrite.

### Operations — configurable table density

The Orders table must support configurable column visibility so the user can build a compact operational view for large order sets.

Required behavior:

- individual show/hide controls;
- compact default set focused on actionability;
- optional provenance/diagnostic columns;
- reset to defaults;
- local persistence of the preference;
- no loss of underlying order data when a column is hidden.

### Allocation / Portfolio — decision layer vs diagnostic layer

The current E2E view demonstrates excessive horizontal and vertical density.

The allocation table should prioritize the decision fields (object, route, capital, quantity, projected return, ROI and time-to-sell). Detailed evidence/provenance/confidence/constraint explanations should move to a secondary expandable or contextual layer.

Repeated identical `DATA_ISSUE` messages should be grouped or summarized with counts, while retaining access to the detailed rejection evidence. The UI must remain explicit about degraded data; this is a density improvement, not permission to hide or coerce the underlying state.

## 1. Purpose

### Implementation increment 1

Implemented and CI-verified on `ux-03/allocation-contract`: the typed portfolio aggregation boundary, cross-item allocator, Real Portfolio / Proposed Allocation UI split, explicit freshness/coverage behavior, allocation rationale and unallocated reason codes. Character Assets remains out of scope; inventory is therefore still UNKNOWN/PARTIAL rather than zero.

UX-03 must turn Portefeuille into a decision surface with two explicitly separated lenses:

1. **Real Portfolio** — economic exposure already observed or durably reconstructed.
2. **Proposed Allocation** — prospective deployment of a defined capital budget across multiple independent opportunities.

The surface is not a second market scanner, not a net-worth calculator, and not an execution engine.

The contract must prevent five recurrent errors:

- treating a projection as a realized result;
- treating wallet cash, escrow and inventory as the same bucket;
- deriving a "portfolio" from the currently selected item;
- using score as a substitute for ROI/profit/risk;
- turning missing data into zero.

---

## 2. Trader model adopted

A trader thinks in **capital buckets and constraints**, not in a single portfolio number.

### Cash buckets

| Bucket | Meaning | Source | Spendable for new allocation? |
|---|---|---|---|
| Liquid cash | Current balance of the selected treasury source | ESI wallet / manual budget | YES, subject to reserve/policy |
| Buy escrow | Funds attached to active buy orders | Active ESI orders | NO |
| Operational reserve | Explicit safety cash retained by policy | Control Center policy | NO |
| Contingent buy obligation | Remaining notional of an under-covered legacy buy order | Order price × remaining qty minus observed escrow | NO; risk diagnostic |
| Inventory cost basis | Cost of known inventory still held | Financial Truth / future Assets integration | NO; already deployed |
| Inventory market value | Current derived liquidation value of inventory | Market data | NO; valuation only |

The UI must never label the sum of these buckets as "available".

### Core distinction

**Available capital** means capital that can be deployed by a new proposal.

**Committed capital** means capital already economically exposed.

**Reserved capital** means capital deliberately withheld by policy.

These are different concepts even when their numeric values can be related.

---

## 3. Source of capital

The source is the existing treasury resolution model:

`TreasuryResolution.effective_capital`

with provenance:

- `observed_esi`
- `manual`
- `unavailable`

Supported source modes remain:

- corporation wallet division;
- active character;
- manual budget.

### Scope rule

One Proposed Allocation is evaluated against **one resolved treasury scope**.

It must not silently merge:

- character cash and corporation cash;
- different corporation wallet divisions;
- unrelated characters;
- manual budgets and observed ESI balances.

A consolidated scope is valid only when its component sources are explicitly selected and their provenance is known.

### Corporation scope

When the treasury source is a corporation wallet division, the economic scope must match the selected division.

Corporation orders expose `wallet_division`; therefore a corporation allocation must not treat orders belonging to another division as part of this treasury scope.

### Manual budget

A manual budget is a declared simulation budget, not proof of current wallet cash.

The UI must label it as:

**MANUAL / SIMULATION**

unless a separate ESI observation validates the same scope.

---

## 4. Capital formulas

### 4.1 Observed treasury cash

For an ESI-observed character or corporation wallet:

`treasury_cash = observed_wallet_balance`

This is the liquid cash bucket.

For a manual budget:

`treasury_cash = declared_budget`

but provenance remains MANUAL.

### 4.2 Explicit reserve

`policy_reserve = configured reserve amount`

This value is **not inferred** from wallet history, order count or optimizer behavior.

Until a business reserve is explicitly configured, the contract assumes:

`policy_reserve = 0`

and the UI must make the absence of a reserve policy visible rather than pretending that a hidden reserve exists.

### 4.3 Proposed allocation budget

`allocation_budget = max(0, treasury_cash - policy_reserve)`

The allocation budget is the capital eligible for a new proposal.

Buy escrow is not subtracted a second time from an ESI wallet balance. It is displayed as its own reserved bucket.

### 4.4 Hard reserved buy capital

`buy_escrow = sum(order.escrow for active buy orders in scope)`

This is reserved, not spendable.

The active-order ESI contract exposes `escrow` specifically for buy orders. The surface must display it separately from liquid cash.

### 4.5 Contingent buy obligation

`buy_obligation = sum(price × volume_remain)`

`unfunded_buy_obligation = max(0, buy_obligation - buy_escrow)`

This is a diagnostic exposure, not automatically a cash deduction.

Modern new orders are expected to be fully escrow-backed; legacy orders can still exist with historical behavior. The application should therefore expose an uncovered obligation when observed, rather than silently assuming all open buy-order notional is funded.

### 4.6 Real committed capital

Real committed capital is a reporting metric:

`known_committed_capital = buy_escrow + known_inventory_cost_basis`

It must not include estimated market value as if it were cost basis.

### 4.7 Total portfolio equity

A fully authoritative total equity number is **not available yet** because character/corporation Assets are not currently part of the implemented portfolio domain.

Therefore:

- do not present "net worth" as exact;
- do not value missing inventory at zero;
- show **PARTIAL / UNKNOWN** inventory coverage until asset ingestion exists.

The future Assets integration may provide quantity and location facts; market valuation will still remain derived, not financial truth.

---

## 5. Real Portfolio contract

### Primary question

> What is already economically committed, and where is the capital?

### Required sections

#### A. Cash posture

- treasury source and scope;
- provenance;
- liquid cash;
- policy reserve;
- buy escrow;
- contingent uncovered buy obligation;
- proposed allocation budget.

#### B. Active market exposure

For every active order:

- owner;
- corporation/character scope;
- buy/sell;
- type;
- location;
- remaining quantity;
- order notional;
- escrow where applicable;
- issue age;
- remaining duration;
- fill ratio.

#### C. Known inventory exposure

When reconstructable:

- type;
- known quantity;
- FIFO cost basis;
- location when authoritative;
- linked execution/opportunity;
- realized vs remaining inventory distinction.

When not reconstructable:

**UNKNOWN**, never zero.

#### D. Market valuation

Optional derived lens:

- current estimated value;
- valuation source;
- market health;
- age;
- confidence.

This is not accounting truth and must never overwrite realized financial values.

### Real Portfolio non-goals

The Real Portfolio does not:

- invent an inventory valuation when Assets are unavailable;
- transform projected profit into current equity;
- treat open sell-order notional as cash;
- count sell-order notional as cash "locked" by the market; the economic exposure is the underlying inventory;
- treat score as a portfolio value.

---

## 6. Proposed Allocation contract

### Primary question

> Given this capital budget and these policies, how should capital be spread across independent opportunities?

### Candidate universe

The source must be **universe-wide**, not selected-item-derived.

Preferred source:

`GlobalMarketSyncService.getUniverseOpportunities()`

hydrated from the durable opportunity store where available.

The current implementation keeps a bounded discovered candidate set (top 300 by overall score after the configured global scan). Therefore this is a **discovered candidate universe**, not proof that every marketable item/opportunity in New Eden has been evaluated.

The Proposed Allocation header must expose candidate-universe coverage:

- FULL / bounded by explicit scan scope;
- PARTIAL;
- UNKNOWN.

A proposal must never be described as globally optimal when the discovery scan was filtered, limited or incomplete.

The selected catalog item may provide a navigation context, but it must never define the allocation universe.

### Universe states

| State | Meaning | Allocation use |
|---|---|---|
| READY | cross-item candidates available with valid provenance | normal |
| EMPTY | global scan succeeded but no candidates remain | valid empty state |
| UNKNOWN | no trustworthy universe has been established | no proposal |
| STALE | prior candidates exist but freshness target exceeded | display only / no fresh allocation |
| PARTIAL | acquisition incomplete | proposal blocked by default |
| ERROR | current acquisition failed | proposal blocked |
| CACHE | persisted/currently reused candidate set inside accepted freshness policy | usable with label |

A failed global scan must never become an empty opportunity set.

### Candidate eligibility

Default Proposed Allocation candidates require:

1. `is_viable = true`;
2. `costs.net_profit > 0`;
3. `certification.is_actionable = true` when certification exists;
4. no market pillar in ERROR;
5. no required source marked STALE / PARTIAL / UNKNOWN;
6. route and trader-policy constraints pass;
7. finite positive `costs.capital_locked`;
8. candidate remains compatible with the current treasury scope.

Rejected/degraded candidates may remain visible in the candidate list for diagnosis, but not in the default executable proposal.

---

## 7. Opportunity economics: what each metric means

### Projected net profit

`costs.net_profit`

Model output from the current financial calculation.

It is **projected**, not observed.

### Capturable profit

`capturable_profit`

Current implementation derives this from theoretical net profit after turnover and liquidity friction:

`capturable_profit = net_profit × turnover_factor × liquidity_factor`

Therefore capturable profit already contains part of the liquidity/turnover effect.

It must not be treated as an independent probability.

### Profit per day

`profit_per_day = capturable_profit / expected_days_to_sell`

This is a time-efficiency measure of the proposal, not realized daily P&L.

### Projected ROI

`costs.roi`

Projected economic return relative to capital locked.

### Realized net profit

Only the RealizedFinancialOutcomeEngine is authoritative.

It belongs to Performance / Financial Truth, not Proposed Allocation.

### Realized ROI

Only a realized outcome with sufficient financial completeness can produce realized ROI.

No proposed value may be displayed as realized ROI.

---

## 8. Score, confidence and capturability must stay separate

There are three different concepts.

### Overall score

`scores.overall_score`

A **ranking heuristic** composed from several factors.

It is not ROI, profit, confidence or risk.

The current scoring engine includes profit, ROI, liquidity, turnover, capital efficiency, transport and stability components.

### Data confidence

`data_quality.overall_confidence`

Confidence in the underlying market evidence and its provenance.

This answers:

> Can I trust the observed inputs?

It is not probability of profit.

### Prediction confidence

`prediction.prediction_confidence`

Statistical confidence in the prediction model based on history depth and observation consistency.

This answers:

> How much evidence supports the forecast model?

It is not market-data quality.

### Profit realization probability

`prediction.profit_realization_probability`

Probability-like forecast that the trader captures the projected capturable profit.

When available, this is the correct bridge between prospective economics and a forecast of realized profit.

### Capturability score

`scores.capturability_score`

Current implementation is derived from:

`capturable_profit / net_profit`

and therefore should be presented as **capture efficiency of the modeled spread**, not as a second probability.

### Anti-double-counting rule

The optimizer must not independently maximize all of:

- overall score;
- liquidity score;
- turnover score;
- capturable profit;

as if they were four unrelated signals.

The current engine already embeds liquidity and turnover into capturable profit and also into the overall score.

UX-03 therefore treats:

- overall score = discovery/ranking aid;
- capturable profit = prospective economic signal;
- profit/day = time efficiency;
- prediction probability = probability-like forecast;
- data/prediction confidence = evidence quality.

---

## 9. Risk contract

Risk is a vector, not one opaque number.

### Risk fronts

1. **Data risk**
   - LIVE / CACHE / STALE / PARTIAL / UNKNOWN / ERROR.

2. **Market/liquidity risk**
   - visible depth;
   - historical daily volume;
   - expected days to sell;
   - volume exhaustion;
   - competition density.

3. **Capture risk**
   - capturability score;
   - prediction profit realization probability when available.

4. **Price/anomaly risk**
   - `is_anomalous`;
   - anomaly reasons;
   - extreme ROI or price deviation.

5. **Route/security risk**
   - high-sec-only;
   - route jumps;
   - chokepoint policy.

6. **Concentration risk**
   - type;
   - group;
   - category;
   - route.

7. **Execution risk**
   - capital bottleneck;
   - market bottleneck;
   - source/destination liquidity limits.

### Default rule

An anomalous opportunity is visible for diagnosis but is not part of the default allocation proposal unless a future explicit policy enables speculative inclusion.

No new scalar "risk score" should be invented in UX-03 without a separate domain contract.

---

## 10. Liquidity contract

Liquidity must answer:

> How much can I realistically move through this market before my own trade changes the economics?

Existing inputs include:

- source/destination visible depth;
- historical daily volume;
- 7d/30d volume medians;
- turnover ratio;
- expected days to sell;
- volume exhaustion percentage;
- competition density.

### Primary operational metric

**Expected days to sell** is the main trader-facing time metric.

Supporting evidence:

- daily destination volume;
- volume ahead;
- orders ahead;
- depth;
- volume exhaustion.

Important evidence boundary:

Regional market history is region-level traded activity. It is a proxy for destination demand, not proof of station-specific sell-through.

Visible order-book volume is a current snapshot, not executed volume. A large displayed book therefore does not by itself prove liquidity.

A high visible order count alone does not prove high liquidity.

A high ROI with poor liquidity remains a poor capital allocation candidate.

---

## 11. Concentration contract

Every allocation exposes concentration at four levels:

- item/type;
- market group;
- category;
- route.

### Hard constraints

Current hard constraints already exist for:

- max capital per trade;
- max concentration by type;
- max concentration by group.

These must remain enforced.

### Category / route

Category and route are currently **exposure dimensions**, not equivalent hard-policy fields.

Until explicit Control Center limits exist:

- show concentration;
- warn when concentration is high;
- do not invent silent hard caps.

### Denominator rule

Concentration percentage is measured against **deployed Proposed Allocation capital** unless a policy explicitly defines another denominator.

The treasury balance is not the same thing as proposed exposure.

Therefore:

`position_share = allocated_capital / total_proposed_capital_deployed`

and not:

`allocated_capital / total_treasury_balance`

This prevents a portfolio that only deploys part of its budget from appearing artificially diversified.

---

## 12. Allocation objective

The optimizer must produce a **diversified capital plan**, not simply take the highest-score item first.

### Hard gate layer

Reject a candidate when any of the following is true:

- non-actionable certification;
- market data not trustworthy enough;
- non-viable financials;
- projected profit below policy floor;
- projected ROI below policy floor;
- expected days to sell above policy ceiling;
- route/security policy violation;
- capital requirement not finite/positive.

### Objective layer

Among eligible candidates, optimize prospective economic use of capital with transparent priorities:

1. expected realized profit when a sufficiently supported prediction exists;
2. otherwise capturable profit;
3. profit/day;
4. capital efficiency / projected ROI;
5. liquidity and capture quality;
6. lower concentration pressure;
7. deterministic tie-breakers.

The result must always expose the reason capital was left unallocated.

### Important

The optimizer may leave capital idle.

That is a valid result when:

- all remaining candidates violate policy;
- all remaining candidates are too concentrated;
- the next trade is below the minimum meaningful deployment size;
- data quality does not support another allocation;
- the reserve policy consumes the remainder.

Idle capital is therefore not automatically a bug.

---

## 13. Capital and quantity consistency

An allocated position must satisfy all simultaneously:

`allocated_capital <= allocation_budget`

`allocated_capital <= max_capital_per_trade`

`allocated_quantity <= quantity_tradable`

`quantity_cost <= allocated_capital`

`allocated_capital > 0`

Integer quantity rounding must be conservative.

The current optimizer's `Math.max(1, floor(...))` pattern must not allow one unit to be claimed without sufficient capital for that unit.

This is a future implementation acceptance criterion.

---

## 14. Existing optimizer corrections required by the contract

The current `PortfolioOptimizer` is a valid foundation but does not yet fully implement this contract.

Known gaps to preserve:

1. It receives an opportunity list but the current React hook supplies a selected-item list.
2. It enforces type/group concentration but only reports category/route concentration.
3. Its concentration denominator is currently `config.available_capital`; UX-03 requires the deployed proposed capital denominator.
4. It sorts by `overall_score` first; UX-03 must not make score the sole allocation objective.
5. Quantity rounding needs an explicit capital-safety invariant.
6. There is no explicit allocation-reserve field today.
7. There is no separate current-vs-stale proposal state.
8. There is no Real Portfolio source aggregation in the PortfolioView.

These are implementation gaps, not reasons to redesign stable market/ESI foundations.

---

## 15. Proposed Allocation output contract

The result must contain:

### Header

- treasury source;
- capital provenance;
- allocation budget;
- reserve;
- proposed capital deployed;
- unallocated capital;
- number of selected opportunities;
- allocation data health.

### Each allocation line

- opportunity identity;
- item/type;
- group;
- category;
- route;
- allocated capital;
- quantity;
- share of deployed allocation;
- projected net profit;
- capturable profit;
- projected ROI;
- profit/day;
- expected days to sell;
- treasury provenance on the allocation scope and each proposed position:
  - source kind;
  - source id;
  - principal scope;
- liquidity;
- capturability;
- prediction probability when available;
- data confidence;
- prediction confidence;
- risk fronts;
- concentration contributions;
- rationale.

### Unallocated explanation

Must be categorical and explicit:

- reserve;
- no eligible opportunity;
- minimum trade size;
- policy limit;
- concentration limit;
- stale/partial/error market data;
- insufficient capital;
- route/security constraint;
- no trustworthy prediction.

---

## 16. Refresh semantics

A refresh recomputes market-derived candidates and proposed allocation.

Rules:

- never clear the previous valid proposal to zero because a fetch failed;
- preserve the previous valid snapshot with STALE/CACHE semantics when appropriate;
- block a fresh proposal when required candidate data is ERROR/PARTIAL/UNKNOWN;
- make detection timestamp visible;
- record the provenance of every proposed allocation;
- changing the selected catalog item must not change the universe scope;
- a selected-item transition is navigation only.

The Real Portfolio and Proposed Allocation must refresh independently where their source freshness differs.

---

## 17. Loading / empty / stale / partial / error

### Loading

No misleading financial totals.

Show loading placeholders and source being resolved.

### Empty

Valid only when the acquisition succeeded and the resulting business set is genuinely empty.

Example:

> No eligible opportunities under current policy.

### Stale

Previous proposal remains visible but cannot be interpreted as a fresh recommendation.

### Partial

Show what is known, flag what is missing, and do not imply complete optimization.

### Error

Show error diagnostics and preserve prior trustworthy state where available.

### Unknown

Use UNKNOWN where no source-of-truth state has been established.

Never substitute zero for any of the above.

---

## 18. Multi-character and corporation provenance

Every capital or allocation figure must carry a scope:

`source_kind + source_id + principal_scope`

Examples:

- character wallet for character A;
- corporation wallet division 3;
- explicit manual trading budget.

Connected characters are operational contexts, not a shared economic owner. A character can be assigned to a market hub to organize dispersed order management, while corporation-owned orders remain in the corporation scope.

Orders, transactions and realized outcomes must keep economic ownership separate from observing principal.

A character observing corporation orders does not become the economic owner.

---

## 19. Performance boundary

UX-03 may display projected metrics and links to historical performance.

It must not reconstruct realized financial truth itself.

The boundary is:

**UX-03**
- prospective;
- modelled;
- decision support.

**UX-04 / Financial Truth**
- observed;
- reconciled;
- realized.

Cross-linking is allowed. Source-of-truth duplication is not.

---

## 20. Acceptance scenarios

### A. Three independent opportunities

Inputs:
- 100M treasury cash;
- 3 eligible opportunities across 3 types;
- one shared group;
- different routes.

Expected:
- allocation spans multiple types when possible;
- concentration is visible by type/group/route;
- selected result is not simply the first highest-score item.

### B. Selected-item independence

Change the selected catalog item while keeping the global opportunity universe unchanged.

Expected:
- Proposed Allocation candidate set remains universe-wide;
- only navigation context changes.

### C. Reserve

Inputs:
- 100M treasury;
- 10M reserve;
- 90M eligible deployment budget.

Expected:
- 90M is the maximum proposed deployment;
- 10M remains explicitly unallocated as reserve.

### D. Escrow

Inputs:
- 100M liquid wallet;
- 20M buy escrow;
- active buy orders.

Expected:
- 100M is shown as liquid cash;
- 20M is shown as escrow;
- 20M is not added to proposed spendable cash;
- no double subtraction from observed wallet balance.

### E. Legacy under-covered buy order

Expected:
- total buy obligation and observed escrow remain separate;
- uncovered obligation is shown as contingent;
- it is not silently treated as available cash.

### F. Stale candidate

Expected:
- previous candidate can remain visible;
- proposal is marked STALE;
- fresh allocation is blocked until refresh produces trustworthy data.

### G. Market ERROR

Expected:
- candidate is not allocated;
- ERROR is visible;
- no false zero profit or zero liquidity is produced.

### H. No inventory source

Expected:
- Real Portfolio explicitly reports inventory coverage as UNKNOWN/PARTIAL;
- inventory value is not shown as zero;
- no exact total net worth is claimed.

### I. Manual budget

Expected:
- source is labelled MANUAL / SIMULATION;
- no claim of observed wallet balance;
- allocation remains a proposal only.

### J. Concentration pressure

Inputs:
- all profitable candidates belong to one group.

Expected:
- optimizer respects group cap;
- leftover capital is explained rather than forced into the same group.

### K. Prediction available

Expected:
- expected realized profit is shown when forecast data is present;
- prediction confidence and market-data confidence are shown separately;
- probability is never renamed "confidence" without qualification.

### L. Partial candidate universe

Expected:
- allocation is not presented as complete;
- missing/partial candidate sources remain explicit.

### M. Initial degraded universe

Expected:
- a first PARTIAL / STALE / ERROR refresh does not expose calculated positions as a fresh proposal;
- diagnostic rejection reasons remain available;
- only a previously validated proposal may remain visible during the degraded state.

---

## 21. Data sources and freshness expectations

| Source | Information | Contract role | Known cache/freshness characteristic |
|---|---|---|---|
| Character wallet ESI | liquid wallet balance | treasury cash | short cache; current ESI docs describe wallet route caching |
| Character orders ESI | open buy/sell orders, escrow | real exposure | route is cached; current schema exposes order age, quantity and escrow |
| Corporation orders ESI | open corp orders + wallet division | corp exposure | scoped by wallet division |
| Wallet transactions | buy/sell transaction facts | financial reconciliation | historical/provenance |
| Wallet journal | cash movements | reconciliation | not the primary market-order exposure source |
| Market orders | visible order books | current opportunity economics | market-order route is cached for 5 minutes and rate-limited |
| Market history | daily average/high/low/order count/volume | liquidity / turnover history | daily market history |
| Character Assets (future) | actual item quantities/locations | Real Portfolio inventory | currently not implemented in this portfolio domain |
| Opportunity observations | immutable detected opportunities/outcomes | candidate provenance | persisted historical evidence |

The exact freshness state shown to the user must come from the repository's existing health/provenance model rather than from UI guesswork.

---

## 22. External EVE mechanics verified for the contract

The following current EVE mechanics are relevant to UX-03:

- ESI is the official third-party API and distinguishes public vs authenticated routes. https://developers.eveonline.com/docs/services/esi/overview/
- Character wallet balance is exposed through `GET /characters/{character_id}/wallet/`; the route is cached. https://eve-esi.hexdocs.pm/EveESI.Api.Wallet.html
- Open character market orders expose `escrow`, `is_buy_order`, `price`, `volume_remain`, `volume_total`, location and issue time. https://apidog.com/apidoc/docs-site/346592/api-3531117
- Corporation open orders additionally expose `wallet_division` and `issued_by`, which is why the treasury scope must preserve wallet-division provenance. https://apidog.com/apidoc/docs-site/346592/api-3531120
- Character Assets expose quantities and locations, but the route is currently not integrated into this portfolio domain. https://share.apidog.com/apidoc/docs-site/346592/api-3531035
- Regional market history exposes average, high, low, order count and traded volume, making it suitable for historical liquidity/turnover evidence rather than current book state. https://vi0qh52iwq.apidog.io/api-3531126
- CCP added rate limiting to the regional market-orders group in February 2026 and specifically cites the five-minute cache window as a reason not to poll more frequently. https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- Current CCP market fee documentation confirms that broker fees apply to non-immediate orders and relisting has a separate charge formula; therefore repeated order churn has a real economic cost and should not be ignored when evaluating trading turnover. https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax https://support.eveonline.com/hc/en-us/articles/203218932-Buy-and-Sell-Orders

---

## 23. Definition of Ready for implementation

UX-03 is implementation-ready when:

1. this economic model is accepted;
2. the cross-item universe source is wired to a durable/current opportunity set;
3. treasury scope and provenance are explicit;
4. Real Portfolio buckets are separated;
5. concentration denominator is fixed;
6. score/capturability/prediction/data confidence are separated;
7. category/route treatment is explicit;
8. risk fronts are explicit;
9. refresh/error semantics are implemented as stated;
10. the acceptance scenarios above are executable tests;
11. the current PortfolioOptimizer corrections are covered by tests;
12. documentation, roadmap and state documents are synchronized on the implementation branch.

---

## 25. Data availability and implementation boundary

The detailed traceability matrix is maintained in [UX-03 — Data Availability & Derivation Matrix](../validation/ux-03-data-availability.md).

### Core rule

UX-03 must distinguish four kinds of data:

- **FACT** — already supplied by ESI or an existing repository source;
- **DERIVED** — deterministic calculation from existing facts;
- **AGGREGATED** — new application model combining existing facts;
- **NEW SOURCE** — requires an additional ESI acquisition/integration;
- **POLICY** — explicitly chosen business configuration, not an EVE fact.

The current conclusion is:

**Most UX-03 fields are FACT + DERIVED + AGGREGATED.**

The first implementation does not require a new market, wallet, order, corporation-credential, financial-truth or prediction acquisition path.

### Truly missing source

The main missing economic source is authoritative inventory coverage through Character Assets.

Without Assets integration:

- inventory quantity is not authoritative;
- inventory location is not authoritative;
- full portfolio equity/net-worth is not authoritative;
- inventory market valuation cannot be presented as complete.

UX-03 must therefore expose inventory coverage as UNKNOWN/PARTIAL rather than inventing zeroes.

### Existing data that only needs an aggregation boundary

The following are not new EVE data sources:

- allocation budget;
- buy obligation;
- uncovered buy obligation;
- deployed capital;
- concentration percentages;
- portfolio-level health;
- allocation rationale;
- unallocated-capital reasons;
- candidate-universe coverage;
- Real Portfolio snapshot;
- Proposed Allocation snapshot.

They are application-level views derived from facts already present in the repository.

### Current opportunity coverage limitation

The existing Global Market Sync keeps a bounded candidate set. A Proposed Allocation is therefore optimal only relative to the **discovered candidate set and scan scope** actually available at decision time.

The UI must not claim exhaustive New Eden optimization when the scan was filtered, limited or partial.

### Contract consequence

UX-03 should primarily build a **truthful aggregation and decision layer**, not a parallel ESI data-acquisition system.

This keeps the implementation aligned with the existing architecture and avoids duplicating stable ESI/domain boundaries.

## 24. Decisions intentionally deferred

These choices are deliberately **not invented** here:

- the numeric default for an operational cash reserve;
- hard category concentration limits;
- hard route concentration limits;
- whether a future UI will allow manual candidate inclusion/exclusion;
- whether full inventory valuation is cost-basis, liquidation-value, or both as a primary headline.

Those require either a Control Center policy decision or the missing Assets domain.

Until then, the UI must expose the distinction instead of pretending the answer is known.
