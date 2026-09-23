# P0-A — Public Market-Order Consumer Audit

Status: AUDIT COMPLETE — DOCUMENTATION-ONLY INCREMENT
Audit branch: `audit/p0-market-consumers`
Audit base: `main` at `18e1556a4b00331b1089b98a060bbdc2b78030ad`
Scope: public consumers of `GET /api/markets/:regionId/orders` outside Operations
Date: 2026-09-24

## Audit conclusion

The repository contains one production caller of the public market-order route:

`src/services/esi.ts::EsiService.fetchLiveOrdersDetailed`

All other production consumers reached by the audit consume the structured `EsiFetchOrdersResult` through `MarketDataStore`, `GlobalMarketSyncService` or `MarketOutcomeTracker`.

No concrete non-Operations production path was found that currently converts an HTTP/ESI market failure into a certifiable ordinary empty market. The affected paths retain explicit `ERROR`, `PARTIAL` or `STALE` quality semantics and the opportunity/outcome consumers reject or degrade non-actionable data.

No production code change is therefore justified by P0-A alone.

A latent API hazard remains: `EsiService.fetchLiveOrders()` exposes only `result.orders` and discards `quality`. No production caller of that helper was found. It must not be reintroduced for business decisions without carrying explicit quality semantics.

## Caller inventory

| File / module / route / component | Entry point | Consumer type | Nominal | HTTP 401 | HTTP 429 | ESI / transport error | STALE / PARTIAL | Fallback | Failure → empty collapse risk | Existing coverage | Test to add | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `src/services/esi.ts` — `/api/markets/:regionId/orders` | `EsiService.fetchLiveOrdersDetailed(regionId, typeId)` | Direct application caller / acquisition boundary | Returns orders + `quality` | First-page failure becomes explicit `ERROR` quality; status preserved | Explicit `ERROR` after bounded backend handling; `Retry-After` captured | Explicit `ERROR`; HTTP/cache/ESI diagnostics retained | Later page failure is `PARTIAL`; earlier valid orders are retained | No silent default; returns `orders: []` only together with explicit error quality on fatal first-page failure | LOW at this boundary; the companion legacy helper is the latent hazard | `src/services/__tests__/esi.test.ts`; transport metadata in `server/__tests__/esi_hardening.test.ts` | No P0-A addition; 429 browser proof belongs to P0-B | PASS |
| `src/services/marketDataStore.ts` | `MarketDataStore.fetchLiveItemData(typeId, hubs, forceRefresh)` | Central market-store consumer | Stores verified snapshot and quality | No prior snapshot → `ERROR`; prior usable snapshot → explicit `STALE` | Same, while copying Retry-After / error-budget metadata | Same | Previous orders remain visible as `STALE`; partial remains degraded | Previous usable snapshot or explicit error snapshot | LOW; returned book can be empty, but quality is explicit and consumer UIs read it | `src/engine/__tests__/market_data_quality.test.ts` | No addition indicated by audit | PASS |
| `src/hooks/useMarketData.ts` + `src/components/MarketDataHealth.tsx` | `useMarketData`; `MarketDataHealth` render | Shared non-Operations UI consumer | Hydrates books + qualities and exposes health globally | Health/error remains visible; no ordinary healthy-empty signal | Quality diagnostics are available for display | Health surface uses canonical states | `STALE` / `PARTIAL` remain distinct | None that erases quality; initial missing state is `UNKNOWN` | LOW; market-health UI explicitly states an error does not mean zero orders | Existing market-data quality + browser infrastructure; no dedicated non-Operations failure scenario | No P0-A addition; P0-B will exercise browser 429 deterministically | PASS |
| `src/hooks/useTradingOpportunities.ts` → `src/services/scanner.ts` → `src/engine/interRegional.ts` | `InterRegionalScanner.scanItemAcrossHubs(...)` | Discovery / opportunity consumer | Uses order books + quality map | Market-data pillar becomes FAIL and opportunity is non-actionable | Same quality path | Same | `STALE` / `PARTIAL` become DEGRADED and non-actionable | Missing book may be represented as `[]`, but quality is supplied separately and gates certification | LOW on certifiable business outcome; empty arrays alone cannot produce a certified ERROR-path opportunity | `src/engine/__tests__/market_data_quality.test.ts`; `opportunity_certification_pillars.test.ts` | No addition indicated by audit | PASS |
| `src/services/globalMarketSync.ts` + Global Scanner UI | `GlobalMarketSyncService.startGlobalSync(...)` | Global scan / discovery consumer | Per-item regional books + quality map; progress tracks failures | `itemFailed = true`; failed item increments failed count | Error count and quality propagate; failed item not counted as success | Same | Scanner receives explicit quality; certification rejects/degrades as above | No failed book inserted as ordinary valid data; progress exposes failures | LOW for certified opportunities | `src/services/__tests__/globalMarketSync.test.ts` verifies HTTP 503 failure accounting; `GlobalMarketSyncModal` shows Success / Failures | No P0-A addition | PASS |
| `src/services/marketOutcomeTracker.ts` | `collectAndRecordForObservation(...)` / `evaluateOutcome(...)` | Empirical outcome consumer | Records only valid post-observation market evidence | Quality validation rejects `ERROR` | Same once upstream returns explicit error quality | Evaluation returns invalid with error details | Store snapshot must be fresh and non-expired; otherwise live ESI fetch is required | Returns structured `recorded:false, error` | NONE on recorded outcome | `src/engine/__tests__/market_outcome_tracking.test.ts` | No addition indicated by audit | PASS |
| `src/services/esi.ts` legacy helper | `EsiService.fetchLiveOrders(regionId, typeId)` | Legacy convenience API; no production caller found | Returns order array only | Would discard `quality` and therefore expose `[]` on fatal error | Same latent hazard | Same latent hazard | Same loss of quality | `result.orders` only | MEDIUM/HIGH if reused for business decisions | Definition found; no production caller found | Do not add a caller. Require explicit quality-aware API before reuse | N/A — latent hazard only |

## Excluded by scope

Operations consumers were deliberately not treated as P0-A targets because UX-02 already owns their failure gate and browser certification.

The main excluded paths are:

- `src/components/MyOrdersView.tsx`
- `src/hooks/useCharacterSync.ts`
- `src/services/orderAdvisor.ts`

They already consume the canonical market health / actionability state and were covered by the previous Operations certification.

## Evidence and interpretation

The direct route search found no production browser/component fetch outside `EsiService.fetchLiveOrdersDetailed`. The remaining `/api/markets/.../orders` references are server route tests, ESI gateway tests, or deterministic harnesses.

The key invariant is preserved downstream:

`FailureSemantics.evaluateHealth` maps explicit error metadata to `ERROR`; the inter-regional certification layer maps market `ERROR` / `UNKNOWN` to a failed market-data pillar; `FailureSemantics.isActionable` allows only `LIVE` and `CACHE` for operational decisions.

Therefore a temporary `[]` representation at an internal collection boundary is not by itself equivalent to a false empty market, provided the quality state remains attached and is consumed by the certification/UI layer. The audited production paths meet that condition.

## P0-A disposition

- Code changes: none required by evidence.
- Documentation: required and updated by this increment.
- P0-B remains the next technical increment: deterministic browser coverage for HTTP 429 + Retry-After + ESI budget.
- Target-PC incident remains NOT ROOT-CAUSED.
