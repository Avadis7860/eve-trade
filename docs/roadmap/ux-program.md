# UX-First Trading Terminal Program

Status: CURRENT
Owner: product / UI-UX
Date established: 2026-09-23
Source: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)

## Purpose

Reframe EVE Trade around the user's actual trading workflow before starting unrelated technical work.

The program is not a visual redesign only. It is an information-architecture, data-truth and workflow contract program.

## Hard sequencing rule

No unrelated chantier starts before this program completes the UX baseline/contract gate.

Only the following may proceed in parallel:
- P0 market/ESI reliability and observability required to establish truth;
- security/regression work;
- documentation needed to specify the UX contracts.

## Workstream order

### UX-00 — Product model and information architecture
Status: DONE

Define and approve the target model:
- Discovery;
- Operations;
- Allocation;
- Performance;
- Cockpit;
- Control Center.

Deliverables:
- navigation model;
- responsibility map per screen;
- shared vocabulary;
- shared state/health vocabulary;
- cross-screen transition map.

Gate:
all six surface responsibilities documented without overlapping ownership.

### UX-01 — Market truth / retrieval observability
Status: P0 / ACTIVE — RETRIEVAL RELIABILITY CLOSE GATE

Purpose:
establish why market-order acquisition can fail and ensure the UI never converts technical failure into an empty market state.

Deliverables:
- observable market request lifecycle;
- explicit HTTP/ESI/cache/rate-limit status;
- stale-cache fallback state;
- per-hub market health;
- reproducible target-PC smoke evidence;
- regression tests for ERROR/PARTIAL/STALE.

Gate:
the implementation now exposes the required market-health evidence and recovery states; the target-PC market-order incident remains NOT ROOT-CAUSED until a target-PC capture contains the required hub, timestamp, HTTP/cache/ESI/rate-limit evidence.

### UX-02 — Operations / Mes Ordres
Status: DONE / MERGED

Deliverables:
- operational KPI strip;
- order-state filters including ageing risk;
- actionable order rows;
- market-context details;
- ageing/expiry/fill visibility;
- advisor integration with ERROR/UNKNOWN safety gating;
- explicit economic ownership display;
- per-order data-health indicators;
- explicit active-order synchronization errors;
- browser proof for keep / adjust / relocate / cancel;
- explicit loading, empty, stale, partial and error acceptance.

Gate:
a trader can inspect an active order and decide whether to keep, adjust, relocate or cancel without leaving the operations context for routine information. Certified by PR #61 run `35859213922`; final status is DONE after PR #61 merge.

### UX-03 — Allocation / Portefeuille
Status: P1

Deliverables:
- Real Portfolio view;
- Proposed Allocation view;
- multi-item opportunity input universe;
- allocation rationale;
- concentration exposure;
- capital remaining;
- diversification by item/group/category/route;
- projected ROI and profit/day;
- rejection/remainder reasons.

Gate:
the system can produce a meaningful diversified allocation across multiple opportunities independent of the currently selected catalog item.

### UX-04 — Performance / Journal
Status: P1

Deliverables:
- automatic ESI trade reconstruction;
- planned vs observed;
- realized net profit;
- realized ROI;
- hold time;
- fees/taxes;
- slippage/capture quality;
- item/route/category performance;
- model prediction error;
- optional personal notes.

Gate:
financial truth comes from ESI-derived observations, not manual entry.

### UX-05 — Control Center / Paramètres
Status: P1

Deliverables:
- real decision parameters surfaced;
- groups organized by business intent;
- impact explanations;
- source-of-truth indicators;
- unwired parameters hidden or clearly disabled;
- technical maintenance separated from trading policy.

Gate:
every visible business parameter has a documented consumer or is explicitly labeled non-operative.

### UX-06 — Cockpit
Status: P2

Deliverables:
- now/next decision summary;
- urgent actions;
- capital;
- actionable discovery;
- allocation snapshot;
- recent performance;
- data-health warnings.

Gate:
cockpit answers "what should I know/do now?" without reproducing the full contents of the other views.

### UX-07 — Interaction, responsive and accessibility hardening
Status: P2

Deliverables:
- desktop/tablet/mobile behavior;
- keyboard/focus states;
- density tuning;
- reduced cognitive load;
- consistent loading/empty/error states.

Gate:
critical workflows pass browser validation on desktop and mobile breakpoints.

## Shared contracts required before implementation

Every surface must define:
- primary user goal;
- primary decision;
- primary data source;
- data health state;
- empty state;
- stale state;
- partial state;
- error state;
- loading state;
- refresh behavior;
- action semantics;
- link/transition destination.

## Anti-drift rules

- Do not create UI-only state when an authoritative domain/source state already exists.
- Do not expose a setting whose engine consumer is absent or unclear.
- Do not label projected values as realized.
- Do not equate score with ROI.
- Do not equate cached data with live data.
- Do not treat a technical failure as zero/empty business data.
- Do not turn a single-item scanner result into a "portfolio" without cross-item opportunity scope.

## Exit criteria for the program

The UX-first program is considered complete only when:
1. target information architecture is documented;
2. P0 market retrieval is observable and reproducible;
3. Operations, Allocation, Performance and Parameters contracts are approved;
4. implementation-ready acceptance scenarios exist;
5. roadmap and backlog are synchronized;
6. the Cockpit contract is defined against the new surfaces.

Until then, technical work should remain constrained to supporting these outcomes.
