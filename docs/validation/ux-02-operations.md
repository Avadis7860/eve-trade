# UX-02 — Operations / Mes Ordres Validation

Status: ACTIVE
Scope: deterministic browser acceptance for the Operations surface
Source of truth: UX-02 surface contract + current Operations implementation
CI gate: Playwright browser E2E + full regression CI

## Acceptance matrix

| Scenario | Expected behavior | Automated |
|---|---|---|
| Active order + LIVE market | Operational KPIs, row context and detail are available | PASS on previous run |
| Market ERROR without prior market snapshot | Active order remains visible; health is ERROR; no recommendation is invented | PASS via UX-02 browser suite |
| Market PARTIAL | Usable page/order data remains visible; market health is PARTIAL and no operational recommendation is presented as reliable | PASS |
| Existing market snapshot followed by fetch failure | Previous market context remains visible as STALE and carries the latest failure; no operational recommendation is presented as current | PASS |
| Valid EMPTY market snapshot followed by fetch failure | Empty observation is preserved and degraded to STALE instead of becoming ERROR/EMPTY | PASS via market-data unit test |
| Market CACHE / UNKNOWN | CACHE remains actionable; UNKNOWN remains non-actionable | PASS via unit test + browser coverage |
| Outbid filter vs health | PARTIAL / STALE market context is excluded from the outbid filter | PASS via browser coverage |
| Background sync vs explicit refresh | Explicit refresh waits for an in-flight background market sync, then performs the single forced refresh | PASS via focused unit test |
| Combined market sources / canonical dedup | Duplicate canonical OrderIds appear once; canonical MarketDataStore value wins when auxiliary sources also contain the order | PASS via focused engine test |
| Row ↔ detail consistency | Same active order keeps owner, item, location, health, remaining quantity and decision context consistent between row and detail | PASS via browser coverage |
| Order detail | Ownership, observation, expected remaining result and decision context are visible | PASS via UX-02 browser suite |
| Projected vs realized values | Remaining sell value is labeled projected; Operations does not claim realized P&L | Covered by typecheck + detail implementation |
| LIVE decision = keep | Reliable keep recommendation is visible in row and detail | PASS in CI run #567 |
| LIVE decision = adjust | Reliable price-adjustment recommendation is visible in row and detail | PASS in CI run #567 |
| LIVE decision = relocate | Reliable relocation recommendation is visible in row and detail | PASS in CI run #567 |
| LIVE decision = cancel | Reliable cancellation recommendation is visible in row and detail | PASS in CI run #567 |

## Invariants

- ERROR / UNKNOWN are not converted into an empty business collection.
- PARTIAL / STALE are inspectable states but are not actionable recommendation states; operational recommendations require LIVE or CACHE data.
- LIVE, CACHE, STALE, PARTIAL, ERROR and UNKNOWN remain distinct.
- Economic ownership remains authoritative; observer identity is separate.
- Remaining order value is operational exposure/projection, not realized financial outcome.
- Performance/Journal remains outside Operations.

## Remaining manual evidence

This deterministic browser suite does not replace target-PC real-CCP evidence. UX-01 target-PC status remains NOT ROOT-CAUSED until the required hub, timestamp, HTTP status, cache, pagination and ESI/rate-limit headers are captured on the affected PC.

## Current gate note
The degraded-data recommendation gate is enforced by `FailureSemantics.isActionable()`. CI now includes lifecycle-state tests, the Operations timing/market-context primitive test, deterministic LIVE decision scenarios and health-aware outbid filtering; this matrix records the acceptance coverage.
