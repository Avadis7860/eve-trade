# UX-01 — Market Data Truth Validation

Status: ACTIVE
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
- the dataset is complete;
- its data state is VALID or an explicitly valid EMPTY result;
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

The market quality suite now verifies that an ERROR snapshot does not suppress a later successful ESI request.

Expected behavior:
1. seed an ERROR/empty snapshot;
2. restore a successful market response;
3. call the normal non-forced fetch path;
4. verify a new market request occurs;
5. verify the recovered order is present;
6. verify the resulting health returns to LIVE.

## Target-PC incident

The user-reported market-order retrieval issue is still classified as NOT ROOT-CAUSED.

The next acceptance step is to run the target PC against a failing/recovering market path and capture:
- hub;
- timestamp;
- HTTP status;
- X-Cache-Status;
- X-Pages;
- X-ESI-Error-Limit-Remain;
- X-ESI-Error-Limit-Reset;
- Retry-After when rate limited;
- displayed health state.

No conclusion about a remaining root cause should be recorded until that evidence exists.

## External ESI constraint

CCP states that /markets/{region_id}/orders is cached for five minutes and is now in a dedicated market-order rate-limit group. The documented group has a 12,000-token budget, and ESI exposes rate-limit headers plus Retry-After when a request is rate limited.

References:
- https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- https://developers.eveonline.com/docs/services/esi/rate-limiting/
