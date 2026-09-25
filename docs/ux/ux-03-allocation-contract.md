# UX-03 — Allocation / Portefeuille — Contrat métier rebasé

Status: PROPOSED CONTRACT / REBASED AGAINST FIN-002 / IMPLEMENTATION NOT STARTED
Scope: UX-03 Allocation, Real Portfolio, Proposed Allocation, economic-operation semantics and decision-support boundaries
Base: `main` @ `5343b465a5028e9822d486d29da522a6c3531645`
Historical source: `archive/ux-03-allocation-contract-2026-09-24`
Related:
- [Financial Contract](../contracts/financial.md)
- [Financial Truth](../domains/finance/financial-truth.md)
- [ADR-0003 — Economic Position and Market-Order Model](../decisions/ADR-0003-economic-position-and-order-model.md)
- [UX-First Trading Terminal Program](../roadmap/ux-program.md)
- [Financial Truth Reconciliation](../roadmap/financial-truth-reconciliation.md)

## 1. Purpose

UX-03 turns Portefeuille into a decision surface with two explicitly separated lenses:

1. **Real Portfolio** — economic exposure already observed or durably reconstructed.
2. **Proposed Allocation** — prospective deployment of a declared capital budget across independent opportunities.

The surface is not:

- a second ESI acquisition system;
- a replacement for Financial Truth;
- a market-order execution engine;
- a market scanner restricted to the currently selected catalog item;
- a net-worth calculator when authoritative inventory coverage is absent.

The current implementation baseline is `main`. The historical UX-03 implementation is reference material only and must not be cherry-picked or copied wholesale.

---

## 2. Rebased financial boundary

Financial Truth on `main` is authoritative for observed economic transactions, acquisition lots, position lifecycle, disposal allocation and realized financial outcomes.

UX-03 consumes that boundary. It does not redefine it.

The canonical dependency is:

`Economic Transaction Fact -> Economic Position Segment -> AcquisitionLot -> DisposalAllocation -> Current Position -> Realized Financial Outcome`

Market-order observations remain a separate layer:

`Market Order Observation -> provenance / current market context`

A market order is therefore not an economic operation.

### 2.1 Market mechanism is not economic direction

Economic acquisition/disposition direction comes from the transaction fact.

The following are equivalent from the accounting perspective:

- acquiring inventory by accepting an existing SELL order;
- acquiring inventory through a trader-created BUY order;
- disposing inventory through an existing or trader-created SELL order.

`MarketOrder.is_buy_order` must never determine accounting direction.

---

## 3. Economic operation / position segment

### 3.1 Definition

For UX-03, an **economic operation** is the economic position segment reconstructed by Financial Truth for an explicit:

`accounting_scope_id + type_id`

The operation is a derived accounting reconstruction boundary. It is not an inference about trader intent.

A single economic operation may therefore involve:

- several economic transaction facts;
- several acquisition lots;
- several disposal transactions;
- several market orders;
- several partial fills;
- several order IDs.

The existence of one order ID must never force one economic operation, and the existence of several order IDs must not imply several economic operations.

### 3.2 Order identity

CCP `order_id` identifies a market-order observation.

It may be retained as corroborating provenance when the source supplies it, but it is not:

- the economic operation ID;
- the acquisition ID;
- the disposal ID;
- proof of acquisition intent;
- proof of realized profitability.

The canonical operation identity remains the Financial Truth position segment.

### 3.3 Character / corporation / issuer / observer

Character and corporation are not automatic accounting silos.

These are distinct dimensions:

- **economic owner** — who economically owns the asset/order when the source establishes it;
- **issuer** — the character associated with issuance of a corporation order when ESI provides it;
- **observing principal** — the authenticated character through which data is observed;
- **accounting scope** — the explicit economic boundary used for reconstruction;
- **market order identity** — CCP order identity for the observed order.

A corporation-owned order observed or issued by a character does not become character-owned.

Cross-character economic reconstruction is allowed only when an explicit common accounting scope exists. Otherwise the streams remain separate even when they concern the same type.

This prevents operational visibility and accounting ownership from being conflated.

---

## 4. Operation lifecycle and profitability semantics

Lifecycle and profitability are different dimensions.

### 4.1 Lifecycle

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

- **OPEN** — no causally matched disposal has occurred.
- **PARTIALLY_REALIZED** — some quantity has been disposed while quantity remains exposed.
- **CLOSED** — the causally attributable remaining quantity reaches zero.

A partial sale is never closure.

Example:

`10,000 units @ 100` followed by `1 unit @ 140` produces:

- disposal quantity: 1;
- disposal gross result: +40 ISK;
- remaining quantity: 9,999;
- remaining cost basis: 999,900 ISK;
- capital committed: 1,000,000 ISK;
- cash recovered: 140 ISK;
- capital recovery delta: -999,860 ISK;
- lifecycle: `PARTIALLY_REALIZED`.

The +40 ISK is valid disposal-level realized information. It is not proof that the complete economic operation is profitable.

### 4.2 Disposal-level realized result

Disposal-level realized P&L is calculated only on quantity actually allocated to causally eligible acquisition lots.

It belongs to Financial Truth.

The current Financial Truth `roi` field is also based on the realized/acquisition cost of the matched quantity. Therefore, during a partial lifecycle, a positive `roi` is a **disposal/allocation ROI**.

UX-03 may display this measure only with an explicit scope label such as "realized disposal ROI". It must never be presented as the ROI of the complete open operation.

### 4.3 Capital recovery

Capital recovery is a separate diagnostic:

`capital_recovery_delta = cash_recovered - capital_committed`

`capital_recovery_ratio = cash_recovered / capital_committed` when the denominator is known and non-zero.

The recovery state is:

- `NEGATIVE` when recovered capital is below committed capital;
- `RECOVERED` when recovered capital equals committed capital;
- `POSITIVE` when recovered capital exceeds committed capital.

A `POSITIVE` recovery state may coexist with `PARTIALLY_REALIZED`.

**Recovery state is not whole-operation profitability.**

### 4.4 Whole-operation ROI and profitability

Whole-operation ROI is distinct from the current disposal/allocation ROI.

For an open or partially realized operation, UX-03 must not present a whole-operation ROI as a realized metric. The complete-operation denominator is the original capital committed by the economic position segment, and the complete-operation numerator is the cumulative realized net result only once the operation is closed and the relevant financial evidence supports it.

Whole-operation profitability must remain closure-gated.

Before the economic position is closed:

- a positive disposal result may be shown;
- a positive disposal/allocation ROI may be shown when supported;
- cumulative capital recovery may be shown;
- the remaining exposure may be shown;
- no whole-operation ROI may be claimed;
- the operation must not be labelled globally profitable.

At closure, a whole-position result and whole-operation ROI may be reported when the relevant financial evidence is complete enough to support them.

Every ROI display must state its scope, lifecycle state and denominator.

### 4.5 Eject / retain semantics

An `EJECT` / `RETAIN` decision is a **POLICY** layer, not an accounting fact.

UX-03 may expose a policy-driven recommendation using:

- lifecycle;
- capital recovery;
- remaining exposure;
- current market valuation;
- projected opportunity economics;
- risk and data health.

Such a recommendation must never rewrite the underlying operation as profitable, loss-making or closed.

---

## 5. Evidence and coverage

The following dimensions remain independent:

- `history_coverage`;
- `economic_origin_coverage`;
- `source_coverage`;
- `financial_completeness`;
- freshness;
- market observation health;
- candidate-universe coverage.

The UI must preserve:

`FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY`

and must never turn:

`UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE / STALE`

into numeric zero or fabricated cost.

A `MARKET_TRACEABLE` position is not automatically ecosystem-complete.

Fee availability is independent of lifecycle:

- gross disposal facts may remain known;
- unavailable fee evidence remains explicitly unavailable;
- net realized P&L/ROI remains unavailable when required fee evidence is missing;
- lifecycle may still reach `CLOSED`.

---

## 6. Real Portfolio contract

### Primary question

> What is already economically committed, and where is that exposure?

### 6.1 Treasury / cash posture

The surface may show:

- treasury source;
- explicit accounting scope;
- provenance;
- liquid cash;
- policy reserve;
- buy escrow;
- contingent uncovered buy obligation;
- capital eligible for a new proposal.

Liquid cash, escrow and reserve are different buckets.

Buy escrow must not be subtracted twice from an already observed wallet balance.

A contingent uncovered buy obligation is a diagnostic exposure, not automatically spendable or automatically deducted cash.

### 6.2 Active order exposure

For active orders, display as available from authoritative order data:

- economic owner;
- corporation/character context;
- issuer when supplied;
- observing principal;
- buy/sell market side;
- type;
- location;
- remaining quantity;
- order notional;
- escrow where applicable;
- issue age;
- remaining duration;
- fill ratio;
- market-data health.

The market-side field describes the order mechanism, not the economic direction of the operation.

### 6.3 Known inventory exposure

When authoritative inventory facts exist, the surface may display:

- type;
- quantity;
- authoritative location;
- cost basis;
- remaining vs realized quantity.

When authoritative Character Assets coverage is absent or incomplete:

- inventory remains UNKNOWN/PARTIAL;
- missing inventory is never zero;
- exact portfolio equity/net worth is not claimed.

Market valuation remains a derived/prospective view and carries its own freshness and health state.

---

## 7. Proposed Allocation contract

### Primary question

> Given a defined capital scope and policy, how should new capital be distributed across eligible opportunities?

Proposed Allocation is advisory and prospective.

It must never be presented as realized financial truth.

### 7.1 Treasury scope

One proposal uses one explicit treasury scope.

It must not silently merge:

- unrelated character wallets;
- corporation wallet divisions;
- personal and corporation cash;
- observed balances and unrelated manual budgets.

A consolidated scope is valid only when the component sources and economic boundary are explicitly defined.

Manual budgets are labelled:

**MANUAL / SIMULATION**

unless the current domain contract explicitly establishes an observed equivalent.

### 7.2 Candidate universe

The candidate universe is cross-item.

The currently selected catalog item is navigation context only. Changing it must not silently replace the allocation universe.

The proposal must expose the coverage of the candidate set:

- `FULL` — only when completeness is actually established for the declared scan scope;
- `PARTIAL`;
- `UNKNOWN`;
- equivalent repository states when supplied by the current health model.

A bounded discovered candidate set may support allocation, but the UI must not call it globally optimal across New Eden.

### 7.3 Candidate eligibility

A candidate can enter the default proposal only when the current source/health contracts support it, including:

- actionable certification when applicable;
- viable prospective economics;
- trustworthy required market inputs;
- positive finite capital requirement;
- policy-compliant route/security;
- policy-compliant concentration;
- no required data pillar in an unsafe state.

Rejected or degraded candidates may remain available for diagnosis, but not be silently converted into executable-looking allocations.

---

## 8. Proposed economics

UX-03 distinguishes:

### Projected net profit

A modelled future value.

It is not realized P&L.

### Capturable profit

A modelled prospective value after the current market/liquidity friction model.

It is not a probability unless a separate probability metric says so.

### Profit per day

A prospective time-efficiency measure:

`profit_per_day = capturable_profit / expected_days_to_sell`

It is not realized daily P&L.

### Projected ROI

A prospective return relative to the declared capital denominator.

The scope and denominator must be visible.

### Realized profit / ROI

Only Financial Truth may provide realized measures.

When a position is PARTIALLY_REALIZED, a realized ROI supplied by Financial Truth refers to the matched/disposed allocation basis unless the source explicitly establishes another scope.

UX-03 must therefore distinguish:

- **realized disposal/allocation ROI** — realized result over the acquisition cost allocated to quantities already disposed;
- **whole-operation ROI** — the complete economic operation result over its original committed capital, available only after closure under this contract.

A disposal/allocation ROI of +40% is not a 40% whole-operation ROI when most of the original operation remains exposed.

---

## 9. Score, confidence and probability

These signals must remain separate.

- **Score** — ranking heuristic.
- **Data confidence** — quality/confidence in observed inputs.
- **Prediction confidence** — evidence supporting the forecasting model.
- **Profit realization probability** — probability-like forecast when available.
- **Capturability** — modeled capture efficiency of the projected economics.

No signal may be renamed to another signal merely for presentation.

Score is never ROI.

Confidence is never probability of profit.

Capturability is never realized profit.

The optimizer must avoid double-counting the same liquidity/turnover information through several independent objective labels when the underlying engine already embeds those effects.

---

## 10. Risk and concentration

Risk is a vector.

Relevant fronts may include:

- data health;
- market/liquidity;
- capture;
- price/anomaly;
- route/security;
- concentration;
- execution/capital constraints.

No new opaque scalar risk score is introduced by UX-03 without a separate domain contract.

### 10.1 Concentration axes

Allocation exposes concentration at:

- item/type;
- group;
- category;
- route.

Existing hard constraints remain authoritative where they already exist.

Category and route become hard caps only when an explicit policy defines those limits.

### 10.2 Concentration denominator

For Proposed Allocation:

`position_share = allocated_capital / total_proposed_capital_deployed`

The denominator is deployed proposed capital, not total treasury balance, unless a future policy explicitly defines a different denominator.

This keeps diversification statements truthful when part of the budget is deliberately left idle.

---

## 11. Allocation objective and idle capital

The allocator is expected to diversify capital rather than blindly select one highest-scoring candidate.

The decision layer should prefer, in a transparent and policy-declared order:

1. supported expected economic return;
2. capturable prospective return;
3. time efficiency;
4. capital efficiency / projected ROI;
5. liquidity and capture quality;
6. lower concentration pressure;
7. deterministic tie-breakers.

The exact priority is a POLICY contract and must remain explicit.

The optimizer may leave capital unallocated.

Valid reasons include:

- reserve policy;
- no eligible opportunity;
- policy floor not met;
- concentration limit;
- minimum trade size;
- insufficient capital for the next unit;
- unsafe route/security;
- stale/partial/error/unknown required data.

Idle capital is therefore not automatically an optimizer defect.

---

## 12. Capital and quantity invariants

For each proposed position:

`allocated_capital <= allocation_budget`

`allocated_capital <= max_capital_per_trade` when such policy exists

`allocated_quantity <= quantity_tradable`

`quantity_cost <= allocated_capital`

`allocated_capital > 0`

Integer quantity rounding must remain conservative.

A one-unit allocation must never be claimed when the capital budget cannot actually fund that unit.

---

## 13. Refresh and health semantics

### Loading

No misleading financial totals.

Display that the source is being resolved.

### Empty

Valid only after a successful, sufficiently complete acquisition with no eligible business rows.

### Cache

Previously observed values may be reused only under the repository's cache policy and must be labelled accordingly.

### Stale

Previous valid state may remain visible but must not be presented as fresh.

### Partial

Show what is known, expose what is missing and avoid claims of complete optimization.

### Error

Show the error and preserve the previous trustworthy snapshot where possible.

### Unknown

Use UNKNOWN when no trustworthy state is established.

A failed acquisition must never become an ordinary empty result.

---

## 14. UX presentation contract

Real Portfolio and Proposed Allocation are separate lenses.

The primary decision table must stay compact.

Primary allocation columns should favor:

- opportunity/object;
- route;
- deployed capital;
- quantity;
- share of proposed deployment;
- projected net profit;
- capturable profit;
- projected ROI;
- profit/day;
- expected days to sell.

Secondary diagnostic content may expose:

- provenance;
- confidence;
- prediction evidence;
- constraints;
- risk fronts;
- concentration contributions;
- data-health details;
- rationale.

Repeated identical rejection diagnostics should be grouped or summarised while retaining access to the underlying evidence.

The UI may simplify presentation density, but it must not simplify away semantic distinctions.

---

## 15. Required provenance

Every financial or allocation value that depends on an observed source must retain or be traceable to:

`source_kind + source_id + principal_scope`

Where applicable, retain:

- accounting scope;
- economic owner;
- observing principal;
- issuer;
- order ID as corroborating order provenance;
- freshness;
- health;
- coverage.

Provenance must not be rewritten merely because a value is displayed in Portfolio.

---

## 16. Data-source boundary

UX-03 uses existing domain boundaries wherever possible.

### FACT

Examples:

- ESI wallet balance;
- ESI active orders;
- ESI corporation orders;
- ESI economic transaction facts;
- persisted market observations.

### DERIVED

Examples:

- capital recovery;
- concentration percentages;
- uncovered obligation;
- projected ROI;
- profit/day.

### AGGREGATED

Examples:

- Real Portfolio snapshot;
- Proposed Allocation;
- portfolio-level health;
- unallocated-capital reasons;
- cross-item proposal.

### NEW SOURCE

Examples:

- Character Assets integration when authoritative inventory facts are required and not currently available.

No new source is added merely to reconstruct an accounting operation that existing transaction facts can establish.

### POLICY

Examples:

- reserve;
- capital-per-trade ceiling;
- concentration caps;
- route restrictions;
- eject/retain thresholds.

---

## 17. Explicit non-goals

UX-03 does not:

- create a new Financial Truth engine;
- create a second FIFO matcher;
- infer accounting direction from market-order side;
- create an economic operation from an order ID;
- automatically split accounting by character/corporation;
- collapse missing/unsafe data to zero;
- claim exhaustive market optimisation from a bounded candidate set;
- turn a market snapshot into realized profit;
- execute, submit, modify or cancel live market orders;
- introduce PI/Industry economic origins.

---

## 18. Acceptance scenarios

### A. Acquire from SELL / dispose through SELL

An acquisition is represented by an economic transaction fact with acquisition direction even when the trader acquired by taking a SELL order.

A later disposal through a trader-created SELL order remains a disposal fact.

Expected: market-order side does not change accounting direction.

### B. One economic operation, several orders

Several transaction facts may reference several market-order IDs.

Expected: they may belong to the same position segment when the accounting scope and causal lineage require it.

Expected: order count does not equal operation count.

### C. Corporation order observed by a character

Expected:

- economic ownership remains corporation;
- issuer remains the issuing character when supplied;
- observer/authenticated principal remains the character through which the data was obtained;
- operational visibility may include the order;
- ownership is not rewritten as personal.

### D. Partial disposal

Input:

`10,000 @ 100` acquired, then `1 @ 140` disposed.

Expected:

- +40 ISK disposal gross result;
- 9,999 remaining;
- lifecycle PARTIALLY_REALIZED;
- capital recovery delta -999,860 ISK;
- any exposed positive ROI is scoped to the disposed/allocation quantity only;
- no whole-operation ROI;
- no globally profitable label for the complete open operation.

### E. Recovery before closure

Input: enough partial disposals to recover all original acquisition capital while inventory remains.

Expected:

- recovery state may become RECOVERED/POSITIVE;
- lifecycle remains PARTIALLY_REALIZED;
- a realized disposal/allocation ROI may be positive;
- whole-operation ROI remains unavailable/not presented;
- whole-operation profitability remains closure-gated.

### F. Full liquidation

Expected:

- remaining quantity reaches zero;
- lifecycle becomes CLOSED;
- a complete whole-position result may be exposed only to the extent financial evidence supports it.

### G. Selected-item independence

Changing the selected catalog item without changing the global opportunity universe.

Expected:

- candidate universe remains unchanged;
- selection is navigation context only.

### H. Diversified proposal

With multiple eligible opportunities, the allocator may spread capital across independent opportunities subject to policy and evidence.

Expected:

- concentration is visible;
- selection is not a single-item echo of the current catalog context;
- leftover capital has an explicit reason when not deployed.

### I. Stale / partial / error candidate universe

Expected:

- previous valid state may remain visible with its health state;
- a degraded refresh cannot be presented as a fresh complete proposal;
- failed retrieval is not rendered as an empty opportunity set;
- no synthetic zeroes are produced.

### J. Missing inventory source

Expected:

- inventory coverage is UNKNOWN/PARTIAL;
- missing inventory is never zero;
- no exact total equity is claimed.

### K. Missing fee evidence

Expected:

- gross realized facts may remain known;
- fee breakdown is explicitly UNAVAILABLE;
- net realized P&L/ROI remains unavailable;
- lifecycle may still close.

### L. Conservative quantity rounding

Expected:

- every proposed quantity is fundable;
- rounding cannot create a one-unit allocation above the remaining capital budget.

### M. ROI scope on a partial operation

Input:

`10,000 @ 100` acquired, then `1 @ 140` disposed.

Expected:

- a Financial Truth disposal/allocation ROI may be positive on the matched unit when fee evidence permits;
- the UI labels that ROI by its disposal/allocation scope;
- no whole-operation ROI is displayed;
- lifecycle remains PARTIALLY_REALIZED.

---

## 19. Implementation gate

UX-03 is implementation-ready only when:

1. this rebased contract is accepted;
2. the current Financial Truth contract remains the sole accounting source of truth;
3. the candidate-universe source and its coverage semantics are explicit;
4. treasury scope and provenance are explicit;
5. Real Portfolio and Proposed Allocation sources are separated;
6. whole-operation profitability and capital recovery remain distinct;
7. operation/lifecycle semantics are implemented from transaction/position lineage rather than market-order side;
8. concentration denominator is fixed;
9. score, capturability, probability and confidence remain distinct;
10. category/route policy treatment is explicit;
11. refresh/loading/empty/stale/partial/error/unknown behavior is covered;
12. all acceptance scenarios are executable;
13. documentation, roadmap and state metadata are synchronized;
14. no archived UX-03 implementation is imported wholesale.

This contract is the prerequisite for a future UX-03 implementation chantier. It does not authorize code changes by itself.
