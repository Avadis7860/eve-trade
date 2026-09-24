# UI/UX Product Audit — Trading Terminal

Status: CURRENT / REFERENCE
Date: 2026-09-23
Scope: product UX, UI information architecture, market/ESI observability, trader workflows
Source of truth: audited main at f5f9a594cb827c9be69ad1a93792496c0ebcfa62, current code/tests/docs, and CCP ESI documentation
Decision: this audit becomes the product reference for the UX-first sequencing program.

## Executive conclusion

The domain and analytical engine are materially more mature than the current UI information architecture.

The application already contains real foundations for:
- ESI market acquisition, caching, ETag/revalidation, pagination and data-quality semantics;
- active character orders and corporation order normalization;
- transaction, order-history and wallet-journal ingestion;
- realized financial accounting;
- trader-performance analytics;
- opportunity scoring and prediction;
- portfolio allocation with concentration limits;
- persistent opportunity observations and outcome tracking.

The primary product problem is therefore not a lack of backend/domain sophistication. It is that the UI presents mature capabilities as loosely connected screens, hides important truth-state information, and in several places uses an abstraction that no longer matches the user's operational mental model.

## Product model to adopt

The target mental model is:

MARKET / ESI
     |
DATA TRUTH / HEALTH
     |
DISCOVERY — OPERATIONS — PERFORMANCE
     |          |             |
     +----------+-------------+
                |
            ALLOCATION
                |
             COCKPIT

Parameters form the control plane governing the whole system.

## Surface assessment

### Discovery Globale

Decision: KEEP / EVOLVE.

Current role is coherent as a universe-wide opportunity radar with filtering and ranking. It should remain the principal discovery surface.

Required evolution:
- make market-data freshness, source, completeness and confidence visible;
- distinguish score from ROI, confidence and predicted return;
- make transitions from discovery to allocation and operations explicit;
- avoid implying that the top retained opportunities are an automatically diversified investment plan.

### Mes Ordres -> Operations

Decision: MAJOR REFACTOR.

Current component is overloaded with authentication, order scoping, market sync, advisor, performance and financial analytics.

Target role:
> central operational console for currently active market positions and required actions.

Required information:
- liquid ISK;
- escrow;
- ISK committed in active sell positions;
- total active orders;
- action-required orders;
- ageing/expiry;
- best current price and distance from market;
- remaining quantity and fill ratio;
- capital still locked;
- estimated turnover;
- expected remaining profit/ROI;
- market-data age/health;
- recommendation and reason.

Order ownership scope and performance-analysis scope must remain separate concepts.

### Portefeuille -> Allocation

Decision: STRUCTURAL REWORK.

The existing PortfolioOptimizer already supports diversification constraints by item type and group, but useTradingOpportunities feeds it opportunities derived from the currently selected item.

This means the UI cannot represent the intended cross-item investment allocation reliably.

Target role:
- Real Portfolio: what is already economically committed;
- Proposed Allocation: how available capital should be spread across multiple independent opportunities.

Allocation should consider projected ROI, net profit, profit/day, capital lock-up, liquidity, confidence/capturability and risk, subject to limits by item, group, category, route and other explicit risk fronts.

### Journal -> Performance & Historique

Decision: REPLACE CURRENT JOURNAL MODEL.

The current UI is a manual CRUD journal backed by local persistence. This is no longer aligned with the available ESI data.

Target role:
> automatic observed-vs-predicted trading history.

It should reconstruct:
opportunity -> order -> fills -> sale -> fees -> realized result.

Manual input should be reduced to optional personal notes/annotations, not financial truth.

### Paramètres -> Control Center

Decision: MAJOR REFACTOR.

The panel is not empty: several controls genuinely affect the engines. The issue is information architecture and trust.

Priority controls should include:
- treasury source;
- effective capital;
- minimum ROI;
- minimum net profit;
- maximum days to sell;
- maximum capital per trade;
- concentration limits;
- trader profile;
- market/hub scope;
- transport/logistics;
- risk and route constraints.

Controls with no current effective consumer, such as currently exposed but unconsumed flags, must be hidden or explicitly marked non-operational until wired.

Separate product controls from technical cache/database maintenance.

### Cockpit

Decision: REPOSITION AFTER OTHER SURFACES.

The cockpit should answer:
> What should I know or do now?

It should aggregate:
- urgent order actions;
- available capital;
- top actionable opportunities;
- proposed allocation;
- recent realized performance;
- data-health warnings.

It should not remain primarily an item-centric scanner wrapper.

## Cross-cutting UX requirement: Data Truth

The application already has explicit data health semantics:
LIVE, CACHE, STALE, PARTIAL, UNKNOWN, ERROR, plus source/freshness/confidence metadata.

These states must become first-class UI primitives.

Critical invariant:
> A failed or unavailable market request must never be visually represented as an ordinary "no orders" state.

At minimum the UI should expose:
- source;
- last successful observation;
- age;
- completeness;
- error state;
- ESI/cache status;
- page counts when relevant;
- confidence where meaningful.

## Historical market-order retrieval report

Operator report:
> market orders are no longer being retrieved from the user's PC.

**Current disposition: RESOLVED / EXTERNALLY BOUNDED.** The application is currently functional. The operator confirmed that the observed symptom was explained by insufficient available data to produce a market to display; no persistent application defect is currently identified.

The repository-side market acquisition path was nevertheless instrumented and certified through P0-A/P0-B/P0-C so future retrieval problems can be distinguished from ordinary data scarcity.

The highest-priority diagnostic area established by the P0 work is the public market-order acquisition path:
EsiService.fetchLiveOrdersDetailed
-> /api/markets/region/orders
-> MarketEsiGateway
-> EsiGateway
-> ESI.

The UI currently swallows several fetch failures with empty/error-silent fallbacks. That can collapse:
ERROR / UNAVAILABLE / PARTIAL / STALE
into an apparent empty result.

CCP currently rate-limits the ESI market-order group and documents the public market-order route as cached for five minutes. The group has a 12,000-token budget, and CCP recommends respecting cache times and spreading requests instead of repeated bursts.

References:
- https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- https://developers.eveonline.com/docs/services/esi/rate-limiting/

The operational P0 work is complete. Future incidents should use the existing health diagnostics/evidence export before any provider, transport or application hypothesis is promoted.

## Priority program

| Priority | Program | Outcome |
|---|---|---|
| P0 | Market / ESI observability and retrieval reliability | distinguish LIVE/CACHE/STALE/PARTIAL/ERROR and preserve diagnostic evidence; historical target-PC report resolved |
| P1 | Operations / Mes Ordres | usable market-position control center |
| P1 | Allocation / Portefeuille | genuine multi-opportunity capital allocation |
| P1 | Performance / Journal | automatic ESI-based observed-vs-predicted history |
| P1 | Control Center / Paramètres | expose real decision parameters, hide fake/unwired controls |
| P2 | Cockpit | decision-oriented synthesis over the above surfaces |
| P2 | Navigation / responsive / accessibility hardening | reduce cognitive load after product model is established |

## Explicit sequencing gate

No unrelated chantier should start while the UX-first program is in discovery/design/contract definition.

Allowed work before product-UX gate completion:
- P0 reliability/observability work strictly necessary to establish data truth;
- documentation and contract work required by the UX program;
- regression/security fixes that protect the current system.

Disallowed before the UX program's baseline contracts are accepted:
- generic persistence refactors;
- broad component decomposition for its own sake;
- performance work without a direct UX contract;
- unrelated feature expansion.

## UX Definition of Ready for implementation

A surface is implementation-ready only when its contract specifies:
1. user goal;
2. primary decisions;
3. information hierarchy;
4. primary actions;
5. data source and truth state;
6. loading/empty/error/stale/partial states;
7. cross-view transitions;
8. mobile/responsive behavior;
9. validation scenarios.

## References

- [UX sequencing program](../roadmap/ux-program.md)
- [ADR-0002 — UX-first sequencing](../decisions/ADR-0002-ux-first-trading-terminal.md)
- [Master Plan](../roadmap/master-plan.md)
- [Known Gaps](../state/known-gaps.md)
- [Frontend architecture](../architecture/frontend.md)
