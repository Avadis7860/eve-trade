# Trading Terminal — Surface Contracts

Status: CURRENT / UX-00 CONTRACT
Date: 2026-09-23
Reference: UI/UX Product Audit 2026-09-23
Program: UX-First Trading Terminal

## Purpose

Freeze the product responsibilities and information hierarchy before the major UI refactors.

## Surface map

| Surface | Primary question | Primary source | Primary decision |
|---|---|---|---|
| Discovery | What opportunities exist? | market observations + opportunity engine | which opportunity deserves inspection |
| Operations | What should I do with active positions? | character/corporation orders + live market context | keep / adjust / relocate / cancel |
| Allocation | Where should available capital go? | opportunity universe + treasury + risk policy | allocate / reserve / leave cash |
| Performance | What did my trading actually produce? | ESI economic transactions + derived positions/allocations; order history and market observations are corroborating activity/provenance | measure realized performance and model accuracy |
| Control Center | Which rules govern the engine? | persisted FinancialConfig + runtime sources | change trading policy |
| Cockpit | What matters right now? | aggregation of the five surfaces above | prioritize attention |

## Navigation principle

Discovery is exploratory.
Operations is operational.
Allocation is prospective.
Performance is retrospective.
Control Center is configurational.
Cockpit is synthesizing.

No surface should silently become the source of truth for another domain.

Financial Truth is transaction/position based. Market-order side, current order history and opportunity snapshots are not substitutes for acquisition facts or realized P&L.

## Shared data-truth vocabulary

The UI must use one common vocabulary:

- LIVE: complete current ESI-backed data.
- CACHE: previously fetched data reused without claiming a current live fetch.
- STALE: cached/observed data whose freshness is outside the operational target.
- PARTIAL: current acquisition contains incomplete pagination/data.
- UNKNOWN: no trustworthy state established.
- ERROR: current acquisition failed and no trustworthy replacement exists.

EMPTY is not a health state by itself. An EMPTY result is valid only when the acquisition itself is successful and complete.

## Shared state contract

Every data-bearing surface must define:
1. loading;
2. empty;
3. live;
4. cache;
5. stale;
6. partial;
7. unknown;
8. error.

The UI must distinguish:
- “there is no data”;
- “there are no business rows”;
- “the system could not retrieve the data.”

## Discovery contract

### Header
- active item/universe context;
- result count;
- active filters;
- data freshness where applicable.

### Primary body
- opportunity identity;
- route;
- source and destination price;
- net profit;
- projected ROI;
- expected turnover;
- capital requirement;
- score;
- confidence/capturability;
- data-health state.

### Primary transition
Open detailed opportunity, then:
- send to Operations context when an existing position/order is relevant;
- send to Allocation as a candidate investment.

## Operations contract

### Header KPIs
- liquid ISK;
- escrow;
- active order count;
- capital locked;
- action-required count;
- ageing-risk count.

### Primary table
Each order row must make visible:
- owner;
- buy/sell;
- item;
- location;
- price;
- remaining quantity / fill ratio;
- remaining duration;
- locked capital;
- market distance;
- current market data health;
- recommendation.

### Detail context
An order detail must show:
- latest market observation;
- order state;
- expected remaining outcome;
- rationale for recommendation;
- data age;
- ownership provenance.

## Allocation contract

The detailed implementation contract is [UX-03 — Allocation / Portefeuille — Contrat métier détaillé](ux-03-allocation-contract.md), with source/derivation traceability in [UX-03 — Data Availability & Derivation Matrix](../validation/ux-03-data-availability.md).

### Real Portfolio

Economic exposure already observed or durably reconstructed:

- treasury source and provenance;
- liquid cash;
- explicit policy reserve;
- buy escrow;
- contingent uncovered buy obligation;
- active orders;
- known inventory cost basis when authoritative;
- derived inventory market valuation when market data is trustworthy;
- concentration by type/group/category/route;
- explicit inventory coverage state.

Inventory coverage is allowed to be UNKNOWN/PARTIAL. Missing inventory is never interpreted as zero.

### Proposed Allocation

Prospective deployment against a resolved treasury scope:

- explicit allocation budget;
- cross-item candidate universe;
- allocated capital;
- quantity;
- deployed allocation share;
- projected net profit;
- capturable profit;
- projected ROI;
- profit/day;
- expected days to sell;
- liquidity;
- capturability;
- prediction probability/confidence when available;
- data confidence;
- risk fronts;
- diversification;
- unallocated capital and reason.

The candidate universe is sourced from the universe-wide discovery opportunity set, not from the currently selected catalog item.

Score is a ranking aid only. It is not ROI, profit or probability.

Proposed allocation is advisory and must not be presented as realized financial truth.

## Performance contract

Primary questions:
- What did I earn?
- How much acquisition capital has been recovered?
- How efficient was the capital within an explicitly declared scope?
- Where did the model over/under-perform?
- Which items/routes/categories work best for me?

Required dimensions:

### Realized accounting

- realized net profit;
- realized gross profit where fee state permits;
- hold time;
- fees/taxes;
- slippage/capture;
- item;
- route;
- category;
- character/corporation attribution;
- predicted vs observed.

Realized P&L is calculated only on quantities actually disposed and allocated to known acquisition lots.

### Position / whole-operation progress

- capital committed;
- cash recovered from actual disposals;
- capital recovery delta;
- capital recovery ratio when defined;
- remaining quantity;
- remaining cost basis;
- position lifecycle: OPEN / PARTIALLY_REALIZED / CLOSED / UNKNOWN;
- data coverage/completeness.

Capital recovery delta is not realized P&L. A negative recovery delta means the acquisition capital has not yet been recovered at the position/operation level.

Example: 10,000 units bought at 100 ISK and 1 sold at 140 ISK yields +40 ISK realized gross P&L on the disposed unit, while the position remains PARTIALLY_REALIZED with 999,860 ISK of unrecovered acquisition capital.

### ROI and break-even

Every ROI display must declare its scope and denominator. A disposal-level ROI must not be presented as the ROI of the complete still-open position.

Whole-position realized performance is complete only once the position is closed, unless a separate explicitly marked current-market valuation is displayed.

Break-even is a POLICY state. Its basis must be explicit, for example gross or net of fees. A later pricing policy may use break-even as a threshold for accepting a lower margin; this does not alter historical acquisition cost or realized accounting.

Current-market valuation remains separate from realized P&L and must carry its own data-health state.

Manual notes are annotations only, never financial truth.

## Control Center contract

Business policy must be grouped by intent:

1. Trader profile.
2. Treasury / capital.
3. Return thresholds.
4. Concentration / diversification.
5. Market scope.
6. Logistics.
7. Risk / route constraints.

Technical diagnostics and cache maintenance must be separated into an advanced section.

Every visible business control must have a documented effective consumer.

## Cockpit contract

The cockpit is a synthesis layer.

It should surface:
- urgent operational actions;
- current capital posture;
- best actionable opportunities;
- allocation snapshot;
- recent realized performance;
- data-health warnings.

It must not duplicate full tables owned by Operations, Allocation or Performance.

## Cross-surface transitions

Discovery → Opportunity Detail → Allocation candidate
Discovery → Opportunity Detail → Operations when an existing position exists
Operations → market opportunity context
Operations → Performance for historical attribution
Performance → item/route/category drill-down → Discovery
Allocation → Opportunity Detail
Cockpit → the owning surface for action

## Implementation gate

UX-00 is considered complete only when this document and the UX program agree on:
- surface responsibilities;
- shared vocabulary;
- state semantics;
- primary transitions;
- implementation-ready acceptance scenarios.
