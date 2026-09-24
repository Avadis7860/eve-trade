# UX-01 — Market Data Truth Validation

Status: CLOSED — EXTERNALLY BOUNDED
Date: 2026-09-23
Scope: market-order retrieval, quality propagation and UI truth states
Reference: [UX-First Trading Terminal Program](../roadmap/ux-program.md)

## Purpose

Prove that market-order acquisition no longer collapses transport failure into an apparently empty business result.

## Implemented guarantees

### Cache eligibility

A market snapshot may only short-circuit a fresh fetch when:
- its source is ESI;
- the last fetch has zero errors;
- the dataset is complete, or is an explicitly valid empty ESI result;
- its data state is VALID or EMPTY;
- it is inside the five-minute freshness window.

ERROR, PARTIAL and failed snapshots cannot become healthy cached data.

### Partial data

When ESI returns usable orders but the pagination is incomplete, the orders are preserved with PARTIAL health instead of being discarded.

### Failed fallback

When a fresh ESI request fails and an older snapshot exists:
- the previous orders remain available;
- the displayed source becomes CACHE;
- freshness becomes STALE;
- data state becomes STALE;
- health becomes STALE;
- the current HTTP/error/rate-limit diagnostic fields are preserved.

### UI truth surface

The application now exposes a shared market-data health strip with per-hub state:
- LIVE;
- CACHE;
- STALE;
- PARTIAL;
- UNKNOWN;
- ERROR.

It also exposes age, order count, HTTP status and relevant ESI/cache diagnostics through accessible labels/tooltips.

## Regression proof

The market quality suite now verifies:
- an ERROR snapshot does not suppress a later successful ESI request;
- a valid EMPTY ESI snapshot does not trigger a refetch loop;
- a transport/parse exception degrades an older usable snapshot to explicit STALE cache.

Expected behavior:
1. seed an ERROR/empty snapshot;
2. restore a successful market response;
3. call the normal non-forced fetch path;
4. verify a new market request occurs;
5. verify the recovered order is present;
6. verify the resulting health returns to LIVE.

## Historical target-PC incident

The previously reported market-order display problem is resolved. The application is currently functional, and the operator confirmed that the symptom was caused by insufficient available data to produce a market to display.

P0-C is implemented and certified on main. The **Exporter preuve P0-C** JSON bundle remains available as a reusable diagnostic tool, but the historical incident no longer blocks product work.

The classification is **EXTERNALLY BOUNDED**: the repository-side path is certified, while the historical symptom is explained by the data-availability context rather than by a reproducible persistent software defect.

The procedure in [P0-C target-PC evidence](p0-c-target-pc-evidence.md) is retained for future real-world diagnostic cases.

## External ESI constraint

CCP states that /markets/{region_id}/orders is cached for five minutes and is now in a dedicated market-order rate-limit group. The documented group has a 12,000-token budget, and ESI exposes rate-limit headers plus Retry-After when a request is rate limited.

References:
- https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- https://developers.eveonline.com/docs/services/esi/rate-limiting/
