# Financial Contract

Status: STABLE / FIN-002 RECONCILED
Owner: finance domain
Implementation: `src/types/financial.ts`, `src/engine/positionLedger.ts`, `src/engine/realizedFinancialOutcome.ts`
Validation: `position_ledger.test.ts`, `financial_truth_recovery.test.ts`, `realized_financial_outcome.test.ts`

## Canonical model

`Economic Transaction Fact -> Economic Position Segment -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome`

Market orders remain observation/provenance records. A CCP `order_id` is correlation/provenance only and never becomes an economic operation identifier.

## Accounting scope and provenance

`accounting_scope_id + type_id` define the reconstructed economic position boundary.

Character, corporation, issuer, observing character and authenticated principal are preserved as attribution/provenance dimensions. They are not automatic accounting silos.

Every transaction/lot/allocation should preserve:

`source_kind + source_id + principal_scope`

Cross-character allocation is permitted only when an explicit common accounting scope exists.

## Direction

Economic acquisition/disposition direction comes from the transaction fact. `MarketOrder.is_buy_order` is never used as accounting direction.

A trader may acquire by taking an existing SELL order and later dispose through a SELL order. The market-side mechanism does not change the accounting fact.

## Position lifecycle

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

Closure is reached only when the causally known remaining quantity reaches zero.

Partial disposal is an event result, not position closure.

Example:

- acquire 10,000 at 100 ISK;
- dispose 1 at 140 ISK;
- realized gross result on the disposed unit = +40 ISK;
- remaining quantity = 9,999;
- remaining cost basis = 999,900 ISK;
- capital committed = 1,000,000 ISK;
- cash recovered = 140 ISK;
- capital recovery delta = -999,860 ISK;
- lifecycle = `PARTIALLY_REALIZED`.

The +40 ISK is not a whole-position profitability result.

## Whole-position profitability policy

A disposal-level result and capital recovery are distinct measures.

The repository's whole-position / whole-operation profitability state is **closure-gated**: a positive partial disposal must not make the still-open economic position globally profitable. A position remains economically unresolved while quantity remains open.

Capital recovery may be reported separately:

`recovery_delta = cash_recovered - capital_committed`

`recovery_ratio = cash_recovered / capital_committed` when the denominator is known and non-zero.

Break-even remains a `POLICY` concept whose gross/net basis must be explicit. Recovery state must never be substituted for realized P&L.

## Evidence and coverage

The following are independent dimensions:

- `history_coverage`: whether the supplied history is known to cover the relevant accounting scope;
- `economic_origin_coverage`: whether relevant origins are sufficiently represented;
- `source_coverage`: whether acquisition/disposal cost lineage is reconstructable;
- `financial_completeness`: whether the financial output, including fee treatment, is fully evidenced;
- freshness, health and market observation coverage.

Default coverage is `UNKNOWN`, never assumed complete.

`UNKNOWN`, `PARTIAL`, `ERROR`, `UNAVAILABLE` and `STALE` must never be collapsed into numeric zero or synthetic cost.

## Fees

Fee evidence is independent from lifecycle.

When fee evidence is unavailable:

- gross realized facts may remain known;
- net realized P&L is `null`;
- net ROI/margin/profit-per-unit are `null`;
- the position can still become `CLOSED` when its remaining quantity reaches zero.

No unavailable fee state may be represented as a zero-fee observed fact.

## Origins

Current supported origin evidence:

- `MARKET_ACQUISITION` — directly backed by observed market transaction facts.

Future-compatible vocabulary exists for:

- `PRODUCTION_OUTPUT`;
- `INTERNAL_TRANSFER`;
- `UNKNOWN_ORIGIN`.

PI/Industry ingestion is not part of this chantier. Unknown origin remains explicit instead of receiving fabricated market cost.

## Matching

The current reconstructed foundation uses deterministic causal FIFO:

- timestamp ascending;
- transaction ID ascending for equal timestamps;
- a disposal cannot consume future inventory;
- unmatched/oversold quantity remains explicit;
- cross-location allocation may be represented when economic lineage remains useful, but source coverage degrades to `PARTIAL` without an explicit transfer fact.

## Contract boundary

The position ledger is the canonical lifecycle/matching calculation. `RealizedFinancialOutcome` consumes that result rather than maintaining a second FIFO implementation.

`calculateForTransactions()` marks its result `TRANSACTION_FACTS` and does not expose a synthetic observation as market evidence.

## Prohibited semantics

- no order-side-to-accounting-direction inference;
- no synthetic economic operation from order IDs;
- no automatic character/corporation accounting split;
- no UNKNOWN/PARTIAL/ERROR/UNAVAILABLE-to-zero fallback;
- no whole-position profitability before closure;
- no market snapshot substituted for realized financial truth.
