# ADR-0002 — UX-first sequencing for the trading terminal

Status: Accepted
Date: 2026-09-23
Deciders: project maintainers
Related: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md), [UX program](../roadmap/ux-program.md)

## Context

The current EVE Trade domain and engine layers are more mature than the presentation layer.

Several screens now expose capabilities that were designed at different stages of the product:
- global market discovery;
- active-order management;
- portfolio simulation;
- manual execution journal;
- configuration and maintenance.

The result is functional overlap, hidden authoritative data, and workflows that no longer match the intended trader mental model.

The most material example is the portfolio surface: the allocation engine supports cross-opportunity concentration limits, but the current hook feeds it opportunities derived from the selected item, preventing the UI from expressing a genuine diversified market allocation.

The second immediate concern is market-order retrieval reliability: the current UI can collapse fetch failures into an apparently empty market, while ESI market-order endpoints are now subject to dedicated rate limiting and a five-minute cache expectation.

## Decision

The project adopts a UX-first sequencing rule:

> The product information architecture, data-truth presentation and critical workflow contracts are specified before unrelated implementation chantier begins.

The mandatory product sequence is:

1. Product model / information architecture.
2. Market/ESI truth and observability (P0).
3. Operations / Mes Ordres.
4. Allocation / Portefeuille.
5. Performance / Journal.
6. Control Center / Paramètres.
7. Cockpit.
8. Responsive/accessibility/interactions.

Unrelated refactors are deferred until the UX baseline is accepted, except when required to support P0 reliability, security or regression safety.

## Consequences

Positive:
- implementation follows a stable product contract instead of discovering requirements screen by screen;
- data truth becomes visible and trustworthy;
- the existing mature engines can be exposed without duplicating business logic;
- portfolio, order and performance workflows become explicitly connected.

Negative:
- some pre-existing technical debt remains intentionally unfixed for a period;
- UI component decomposition may be postponed even when files are large;
- the roadmap becomes temporarily more product/UX heavy than infrastructure heavy.

## Non-goals

This decision does not imply:
- a purely visual redesign;
- rewriting stable domain contracts without evidence;
- removing the current global discovery capability;
- replacing ESI-derived financial truth with manual data.

## Implementation gate

No new unrelated feature or structural refactor is ready to start until its dependency on the UX program is explicit in the current master plan and the relevant surface contract is implementation-ready.

## External ESI context

CCP documents the public market-order route as part of a dedicated rate-limit group and recommends respecting its cache interval and spreading requests rather than repeatedly bursting. The market-order group has a 12,000-token budget.

References:
- https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- https://developers.eveonline.com/docs/services/esi/rate-limiting/
