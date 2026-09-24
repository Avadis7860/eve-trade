# ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders

Status: ACCEPTED / REVALIDATED FOR FIN-002
Date: 2026-09-24
Scope: financial truth, performance, portfolio and market-order provenance

## Context

The archived UX-03 work exposed three semantic boundaries that must remain explicit.

First, a market order's side is not the economic direction of the user's transaction. Acquiring by taking an existing SELL order is still an economic acquisition.

Second, partial disposal is not position closure. An acquisition of 10,000 units followed by disposal of 1 unit realizes only the disposed quantity while 9,999 units remain open.

Third, disposal-level realized P&L must not be confused with whole-position profitability or capital recovery.

## Decision

### 1. Market orders remain observation/provenance entities

A market order is identified by CCP `order_id). Its independent dimensions include market side, issuer, economic owner, observing principal, corporation/wallet context, provenance, freshness and coverage.

Character and corporation are not separate accounting entity species.

### 2. Economic direction comes from transaction facts

Financial accounting uses the transaction fact's acquisition/disposition direction.

`MarketOrder.is_buy_order` is never used as accounting direction.

Active BUY orders describe reserved capital/order exposure; they do not prove that inventory was acquired.

### 3. Acquisition lots are first-class derived records

An `AcquisitionLot` preserves source identity, principal scope, economic owner, type/location, quantity, cost and timestamp.

The generic economic-origin axis supports `MARKET_ACQUISITION`, future `PRODUCTION_OUTPUT`, `INTERNAL_TRANSFER`, and `UNKNOWN_ORIGIN`.

Only `MARKET_ACQUISITION` is currently backed by the observed financial source in this chantier.

### 4. Disposals consume causally eligible lots

A disposal creates one or more `DisposalAllocation` records under the current deterministic FIFO policy.

Lifecycle:

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

Closure requires zero remaining quantity.

### 5. Position segment is the accounting reconstruction boundary

An economic position segment is the contiguous open quantity for one explicit `accounting_scope_id + type_id`.

A new segment starts only after the previous segment reaches zero remaining quantity.

This is a deterministic accounting reconstruction boundary, not evidence of trader intent or a commercial operation.

### 6. Realized result and capital recovery are separate

Realized P&L is calculated from allocated disposal quantities.

Capital recovery measures cash recovered against the capital committed by the position:

`capital_recovery_delta = cash_recovered - capital_committed`

`capital_recovery_ratio = cash_recovered / capital_committed` when defined.

Example:

10,000 units acquired at 100 ISK, then 1 unit disposed at 140 ISK:

- realized gross disposal result = +40 ISK;
- capital committed = 1,000,000 ISK;
- cash recovered = 140 ISK;
- capital recovery delta = -999,860 ISK;
- remaining quantity = 9,999;
- remaining cost basis = 999,900 ISK;
- lifecycle = `PARTIALLY_REALIZED`.

The +40 ISK is not a whole-position profitability result.

### 7. Whole-position profitability is closure-gated

The current policy explicitly separates:

- disposal-level realized result;
- cumulative capital recovery;
- position lifecycle;
- whole-position profitability.

A positive partial disposal does not make the still-open economic position globally profitable.

Capital recovery may be positive while the position is still open, but this does not authorize a whole-position profitable classification.

Break-even remains a `POLICY` state whose gross/net basis must be declared.

### 8. Scope and provenance are orthogonal

Character, corporation, issuer, observer and authenticated principal remain attribution/provenance dimensions.

Cross-character participation requires an explicit common economic `accounting_scope_id`.

Every transaction/lot/allocation should preserve:

`source_kind + source_id + principal_scope`.

### 9. Evidence coverage is first-class

History coverage, economic-origin coverage, source coverage and financial completeness are independent.

Missing coverage is `UNKNOWN` / `PARTIAL`, not zero.

`UNKNOWN`, `PARTIAL`, `ERROR`, `UNAVAILABLE` and `STALE` must not be converted into synthetic numeric facts.

### 10. Fees do not control lifecycle

Fee configuration/evidence is independent from physical/economic closure.

When fee-inclusive net result cannot be established, net P&L and net ratios remain unavailable; lifecycle may still reach `CLOSED`.

### 11. Order IDs do not create operations

Order IDs are optional corroborating provenance. They must not be synthesized or used as a substitute for economic transaction identity.

### 12. Direct transaction calculation is not market observation

`calculateForTransactions()` is explicitly based on `TRANSACTION_FACTS`.

A compatibility calculation must not expose a synthetic observation ID as if it were a real market observation.

## Consequences

The canonical financial vocabulary is:

`Economic Transaction Fact -> Economic Position Segment -> AcquisitionLot -> DisposalAllocation -> CurrentPosition -> Realized Financial Outcome`

The position ledger is the single lifecycle/FIFO calculation boundary. Realized outcome calculation consumes it rather than maintaining an independent second matcher.

Portfolio/UI and broad TraderAnalytics migration are downstream consumers and remain separate product work.

PI/Industry integration is deferred; future economic-source events must feed the same origin/lot pipeline rather than a parallel accounting engine.

## Required regression scenarios

- acquire by taking an existing SELL order, then dispose through a SELL order;
- partial disposal preserves the open position;
- 10,000 @ 100 / 1 @ 140 yields +40 disposal gross result and -999,860 capital recovery delta;
- later acquisition after full liquidation starts a new position segment;
- one disposal can consume several FIFO lots;
- disposal before prior acquisition remains unmatched;
- invalid/missing provenance is explicit and never fabricated;
- shared explicit accounting scope permits cross-character lifecycle attribution;
- different accounting scopes do not match;
- corporation ownership remains explicit and separate from observer;
- incomplete history/origin evidence remains UNKNOWN/PARTIAL;
- missing fee evidence does not become zero net result;
- market-order side never determines accounting direction.
