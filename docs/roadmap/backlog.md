# Backlog

Status: CURRENT
Scope: open work only
Source of truth: revalidated code and current state documents

## Product / UX program

The authoritative product backlog is [UX-First Trading Terminal Program](ux-program.md).

### P0 — Market / ESI truth and retrieval reliability

- Establish observable lifecycle for public market-order requests.
- Surface HTTP, ESI, cache and rate-limit outcomes to the UI.
- Preserve and expose stale cache when appropriate instead of silently returning empty business data.
- Reproduce and diagnose the reported target-PC failure to retrieve market orders.
- Add regression coverage for ERROR, PARTIAL and STALE states.

### P1 — Operations / Mes Ordres — ACTIVE

- Replace the current overloaded order table with an operational market-position console. First increment landed on the dedicated UX-02 branch.
- Expose capital, escrow, active sell value, order age, fill ratio, remaining locked capital, estimated turnover, expected remaining return, market distance and data health.
- Separate economic ownership scope from performance-analysis scope.
- Keep the existing order advisor but make its decision context inspectable.

### P1 — Allocation / Portefeuille

- Split Real Portfolio from Proposed Allocation.
- Feed allocation with a cross-item opportunity universe instead of the currently selected item only.
- Preserve and extend concentration controls.
- Explain invested capital, unused capital, concentration and allocation rationale.
- Optimize for projected ROI/profit/day/liquidity/capturability/risk rather than a single top-scoring item.

### P1 — Performance / Journal

- Replace manual financial truth with ESI-derived trade reconstruction.
- Reconcile opportunities, orders, fills, sales, fees and realized outcomes.
- Compare predicted vs observed profit, ROI and turnover.
- Keep manual input only for optional personal notes.

### P1 — Control Center / Paramètres

- Surface effective decision parameters: capital, ROI floor, profit floor, turnover, position cap, concentration, profile, hubs, logistics and risk.
- Separate business policy from technical maintenance.
- Hide or mark controls that have no effective engine consumer.

### P2 — Cockpit

- Rebuild cockpit around "what should I know/do now?"
- Aggregate urgent order actions, actionable discovery, proposed allocation, recent performance and data health without duplicating full screens.

### P2 — UX hardening

- Responsive behavior.
- Keyboard/focus/accessibility.
- Consistent loading/empty/stale/partial/error states.
- Interaction and information-density tuning.

## Deferred technical work

These remain valid but are explicitly blocked until the UX baseline is accepted:

- PST-001: IndexedDB decomposition.
- UI-001: corporation trading scope UI.
- E2E-002: broader critical browser workflows.
- UI-002: large frontend component decomposition.
- PERF-001: performance measurement/optimization.
- TYPE-001: legacy typing/facade cleanup.

## Operational issue

**Reported:** public market orders no longer retrieve from the user's PC.

**Current status:** NOT ROOT-CAUSED.

Primary diagnostic path:
EsiService.fetchLiveOrdersDetailed -> /api/markets/region/orders -> MarketEsiGateway -> EsiGateway -> ESI.

Important UI failure mode:
fetch failures can currently collapse into empty/unchanged business data because some callers intentionally swallow errors.

Current CCP context:
the public market-order route is in a dedicated rate-limit group, with a five-minute cache expectation and a 12,000-token budget. The implementation must respect response rate-limit/cache metadata and avoid bursty redundant polling.

Reference:
[UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)

## Rule

Historical issues are not copied into the active backlog unless they remain reproducibly open today.

The UX-first sequencing gate is mandatory: no deferred technical item is promoted ahead of UX-00/UX-01 and the relevant surface contract without an explicit roadmap update.
