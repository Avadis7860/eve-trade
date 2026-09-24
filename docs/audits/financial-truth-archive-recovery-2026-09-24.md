# Financial Truth Archive Recovery Audit — 2026-09-24

## A. Repository state

- Repository: `Avadis7860/eve-trade`
- main: `a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8`
- Main Smoke: run #17, **success**, on `a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8`
- Open PRs: none at audit start
- Recovery branch: `chore/financial-truth-archive-recovery`
- Archive: `archive/ux-03-allocation-contract-2026-09-24`, historical head `75df2e8f77d8ccc0cd5a2a631661902d1b54fab6`
- main/archive comparison: **516 commits ahead / 99 behind**, **104 changed files**
- workspace: no local repository checkout was mounted; GitHub state is the authoritative repository check for this session.

## B. Differential classification

The 104-file divergence contains several distinct families.

### A — Recoverable as a current primitive
- explicit financial provenance shape;
- accounting scope;
- economic position segment identity;
- acquisition-lot and disposal-allocation contracts;
- lifecycle state;
- separate capital recovery metrics;
- history/economic-origin coverage vocabulary.

These are recovered through reconstruction, not archive commit replay.

### B — Recoverable after rewrite
- `src/engine/positionLedger.ts`
- financial extensions in `src/types/financial.ts`
- realization integration in `src/engine/realizedFinancialOutcome.ts`

The archived implementation contains useful structure but also legacy `operation_*` compatibility fields and assumptions that must not become the new accounting boundary.

### C — Recoverable as tests / invariants
- `src/engine/__tests__/position_ledger.test.ts`
- selected scenarios from `portfolio_ux03.test.ts`
- lifecycle/coverage/provenance scenarios from the archived analytics tests.

### D — Documentation / decisions
- `ADR-0003-economic-position-and-order-model.md`
- `financial-truth-rebase.md`
- UX-03 allocation/data-availability documents.

Their normative value is extracted and re-expressed in current documentation.

### E — Obsolete / excluded
- UX-03 UI restoration;
- Portfolio aggregation/UI recovery in this increment;
- Fleet model and fleet financial implementation;
- archived CI and Agent Context changes;
- historical ESI/OAuth implementation changes unrelated to financial coverage;
- synthetic operation identity fallbacks;
- any logic that treats `is_buy_order` as accounting direction.

## C. Financial model reconciliation

Target vocabulary:

**Economic Transaction Fact -> Economic Position Segment -> Acquisition Lot -> Disposal Allocation -> Current Position -> Realized Financial Outcome**

Market orders remain observation/provenance records. `order_id` is a correlation identifier, not an economic operation.

Economic owner and observing character remain distinct. Accounting scope is explicit. Cross-character allocation is possible only when transactions are inside the same explicit economic scope and carry sufficient provenance/ownership evidence.

## D. Evidence states

- `UNKNOWN`, `PARTIAL`, `ERROR`, `UNAVAILABLE`, `STALE` never become numeric zero.
- History coverage, economic-origin coverage, source coverage, freshness and health remain independent dimensions.
- Missing fee evidence can make net realized profit unavailable without invalidating lifecycle closure or gross allocation facts.

## E. Partial disposal rule

For `10,000 @ 100` followed by disposal of `1 @ 140`:
- disposal-level gross result may be +40 ISK;
- 9,999 units remain;
- remaining cost basis remains 999,900 ISK;
- lifecycle remains `PARTIALLY_REALIZED`;
- capital recovery is measured separately;
- the aggregate economic operation/position is not classified profitable solely because one disposal is positive.

The implementation must expose the disposal result without confusing it with whole-position closure or cumulative recovery.

## F. Recovery method decision

**HYBRID RECOVERY / RECONSTRUCTION**

Reasons:
- the archive diverges by 516/99 and touches 104 files;
- current main has materially different Agent Context, CI, ESI/OAuth and order ownership boundaries;
- useful financial primitives are conceptually identifiable but their historical implementations contain compatibility layers and older scope assumptions;
- a hybrid approach preserves traceability while minimizing reintroduction of obsolete code;
- rollback is bounded to one dedicated branch/PR;
- current main remains the only integration authority.

## G. Commit plan

1. **Recovery activation and audit** — active-work metadata, current-state/roadmap sync, audit record.
2. **Financial contract reconstruction** — add scope/provenance/coverage/position contracts without replacing current main-only types.
3. **Canonical position ledger** — reconstructed FIFO lot/disposal engine with explicit scope and evidence.
4. **Realized outcome rebase** — delegate matching to the ledger; preserve nullable unavailable evidence and lifecycle separation.
5. **Invariant certification** — rewrite archived ledger scenarios and add current-main financial regressions.
6. **Documentation finalization** — sync financial contract/validation/domain/roadmap state after implementation.

## H. Intentionally deferred

- TraderAnalytics full migration;
- PortfolioAggregation and UX-03 allocation surface;
- UI changes;
- ESI transaction-sync coverage persistence;
- PI/Industry origins beyond the type-level future-compatible vocabulary.

These remain explicit follow-ups rather than hidden omissions.
