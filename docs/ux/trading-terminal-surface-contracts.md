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
| Performance | What did my trading actually produce? | ESI transactions + orders history + wallet journal + execution/outcome data | measure realized performance and model accuracy |
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

Split the surface into:

### Real Portfolio
Economic exposure already committed:
- active orders;
- stock/exposure when authoritative data exists;
- escrow/capital lock;
- concentration.

### Proposed Allocation
Prospective capital deployment:
- available capital;
- candidate opportunities;
- allocated capital;
- expected profit;
- projected ROI;
- profit/day;
- risk/confidence;
- diversification;
- unallocated capital and reason.

A proposed allocation must never depend on the currently selected catalog item only.

## Performance contract

Primary questions:
- What did I earn?
- How efficient was the capital?
- Where did the model over/under-perform?
- Which items/routes/categories work best for me?

Required dimensions:
- realized net profit;
- realized ROI;
- hold time;
- fees/taxes;
- slippage/capture;
- item;
- route;
- category;
- character/corporation attribution;
- predicted vs observed.

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
