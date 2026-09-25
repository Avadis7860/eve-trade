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

Gate:
all six surface responsibilities documented without overlapping ownership.

### UX-01 — Market truth / retrieval observability
Status: DONE / EXTERNALLY BOUNDED

Purpose:
ensure market-order acquisition failures are explicit and never become ordinary empty business state, while closing the reported target-PC incident with evidence.

Completed:
- observable error propagation on the public market-order path;
- HTTP/cache/ESI rate-limit diagnostics forwarded to browser-visible market health;
- stale-cache preservation for previously observed market data;
- deterministic ERROR/PARTIAL/STALE behavior and browser proof;
- global synchronization failure accounting for market-quality ERROR.

Completed:
- P0-A caller audit found no concrete non-Operations failure-to-empty collapse;
- P0-B deterministic HTTP 429 / Retry-After browser coverage is certified;
- P0-C evidence export is implemented, browser-tested and merged;
- the previously reported target-PC market-display issue is resolved and the current application is functional;
- the reported symptom was explained by insufficient available data to produce a market to display; no persistent application defect is currently identified.

Gate:
repository-side market failure semantics are explicit and covered, and the reported target-PC issue is resolved without a remaining reproducible application defect. The issue is classified EXTERNALLY BOUNDED.

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
a trader can inspect an active order and decide whether to keep, adjust, relocate or cancel without leaving the operations context for routine information. Certified by PR #61 run `35859213922` and P0 browser diagnostics by PR #63 run `35862904773`.

### UX-03 — Allocation / Portefeuille
Status: P1 — TASK-02 COMPLETE / IMPLEMENTATION NOT STARTED
Reference: issue #86 / Task-01 contract accepted by PR #93

Task-01 rebase:
- reconcile the historical UX-03 contract against the accepted Financial Truth boundary on main;
- define the economic operation from transaction/position lineage rather than BUY/SELL order pairs;
- keep order ID as market-order provenance/correlation only;
- keep character, corporation, issuer and observer distinct from accounting scope;
- preserve Real Portfolio vs Proposed Allocation;
- define closure-gated whole-operation profitability separately from capital recovery;
- define loading/empty/cache/stale/partial/error/unknown behavior;
- preserve FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY boundaries.

Gate for TASK-01:
the UX-03 contract is accepted and synchronized across roadmap/state documentation. Completed by PR #93.

Implementation gate:
no UX-03 product code starts until a new implementation chantier is opened from current main and the accepted contract's executable acceptance scenarios are in place.

Task-02 data matrix revalidation:
- revalidate the archived Data Availability & Derivation matrix against current main;
- classify each datum as FACT, DERIVED, AGGREGATED, NEW SOURCE or POLICY;
- verify treasury, orders/escrow, Financial Truth positions/lots, inventory/Character Assets, cross-item universe, freshness/coverage/health, projected/predictive metrics and provenance/scope;
- keep the Character Assets boundary explicit;
- make no new ESI acquisition change.

Gate for TASK-02:
the current data matrix is synchronized with current main, its reclassifications are explicit, no new source is introduced, PR #96 is merged, and Main Post-Merge Smoke #23 passes on `af725a6`.

Next task:
issue #87 / TASK-03 — relecture et extraction du modèle typé Portfolio. The implementation must use a newly extracted model from current `main`; the historical archive remains reference-only.

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

Preparation before implementation:
- map every visible control to a real engine consumer;
- separate business policy from technical maintenance;
- define precedence/source-of-truth behavior;
- define impact explanations and non-operative labeling.

Gate:
every visible business parameter has a documented consumer or is explicitly labeled non-operative.

### UX-06 — Cockpit
Status: P2

### UX-07 — Interaction, responsive and accessibility hardening
Status: P2

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
- link/transition destination;
- validation scenarios.

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
