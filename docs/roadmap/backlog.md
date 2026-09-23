# Backlog

Status: CURRENT
Scope: open work only
Source of truth: revalidated code and current state documents

## Product / UX program

The authoritative product backlog is [UX-First Trading Terminal Program](ux-program.md).

### P0 — Market / ESI truth and retrieval reliability — ACTIVE / CLOSING

Completed:
- Observable public market-order error propagation.
- HTTP, cache and ESI budget metadata surfaced to the browser UI.
- Stale-cache preservation on previously observed market data.
- Deterministic ERROR / PARTIAL / STALE coverage.
- Global sync failure accounting for market-quality ERROR.
- Browser certification of operator-facing HTTP 401 + ESI budget diagnostics.
- **P0-A caller audit:** all identified non-Operations market-order consumers are mapped; no concrete failure-to-empty/unchanged collapse was demonstrated.
- Documentation of the P0-A caller matrix and the latent legacy-helper hazard.

Remaining:
- Certify and merge deterministic HTTP 429 / Retry-After browser coverage.
- Capture the real target-PC evidence bundle and classify the incident as ROOT-CAUSED or EXTERNALLY BOUNDED.
- Capture the real target-PC evidence bundle and classify the incident as ROOT-CAUSED or EXTERNALLY BOUNDED.

P0-B implementation is present on the active branch; it is not marked complete until its single PR is CI-certified, merged, and followed by a green Main Smoke.

### P1 — Operations / Mes Ordres — DONE / MERGED

- The Operations console first increment is merged.
- Browser decision gate for keep / adjust / relocate / cancel is certified by PR #61 run `35859213922`.
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

## CI follow-up candidates

- **Draft routing mismatch:** the current PR workflow triggers `CI Foundation & Regression Gate` for Draft PRs as well as Ready PRs. PR #61 was created as Draft and run `35858589551` entered the full six-lane certification topology after `CI / Change Scope` succeeded. This is a confirmed behavior mismatch with the documented Draft Fast Gate model.
- Keep this as a separate CI hardening chantier; do not mix it into the P0 product closure work.

## Operational issue

**Reported:** public market orders no longer retrieve from the user's PC.

**Current status:** NOT ROOT-CAUSED.

Primary diagnostic path:
EsiService.fetchLiveOrdersDetailed -> /api/markets/region/orders -> MarketEsiGateway -> EsiGateway -> ESI.

Evidence now certified in code:
- backend error responses preserve HTTP/cache/rate-limit diagnostics;
- Operations browser flow retains active orders and surfaces market ERROR instead of false zero activity;
- P0-A caller audit maps the non-Operations consumers and found no concrete failure-to-empty collapse affecting certifiable business truth;
- the target-PC incident is still not root-caused because real-PC evidence is not in the repository.

Reference:
[UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
[P0 Market Reliability Plan](p0-market-reliability.md)
[P0-A Caller Matrix](../validation/p0-a-market-consumers.md)

## Rule

Historical issues are not copied into the active backlog unless they remain reproducibly open today.

The UX-first sequencing gate is mandatory: no deferred technical item is promoted ahead of UX-00/UX-01 and the relevant surface contract without an explicit roadmap update.

CI-001 and UX-02 are merged. The current product chantier starts from the merged `main` head and uses one active delivery branch/PR at a time.
