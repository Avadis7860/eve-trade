# UX-02 — Operations / Mes Ordres Validation

Status: PASS — UX-02 DECISION GATE CERTIFIED
Scope: deterministic browser acceptance for the Operations surface
Source of truth: UX-02 surface contract + current Operations implementation
CI gate: Playwright browser E2E + full regression CI

## Acceptance matrix

| Scenario | Expected behavior | Automated |
|---|---|---|
| Active order + LIVE market | Operational KPIs, row context and detail are available | PASS |
| Market ERROR without prior market snapshot | Active order remains visible; health is ERROR; no recommendation is invented | PASS |
| Market PARTIAL | Usable page/order data remains visible; market health is PARTIAL and no operational recommendation is presented as reliable | PASS |
| Existing market snapshot followed by fetch failure | Previous market context remains visible as STALE and carries the latest failure; no operational recommendation is presented as current | PASS |
| Order detail | Ownership, observation, expected remaining result and decision context are visible | PASS |
| Projected vs realized values | Remaining sell value is labeled projected; Operations does not claim realized P&L | PASS |
| KEEP | Active order is visibly classified as `Conserver`; detail exposes the keep rationale | PASS — PR #61 run `35859213922` |
| ADJUST | Active order is visibly classified as `Ajuster`; detail exposes the target price rationale | PASS — PR #61 run `35859213922` |
| RELOCATE | Active order is visibly classified as `Déplacer`; detail exposes the destination hub and economics | PASS — PR #61 run `35859213922` |
| CANCEL | Active order is visibly classified as `Annuler`; detail exposes the cancellation rationale | PASS — PR #61 run `35859213922` |
| Market ERROR diagnostics | Browser exposes canonical ERROR with HTTP 401, cache MISS and ESI budget metadata while active orders remain visible | PASS — PR #63 / CI #698 run `35862904773` |

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

The degraded-data recommendation gate is enforced by `FailureSemantics.isActionable()`. PR #61 run `35859213922` proved the decision loop and degraded-data protections; PR #63 run `35862904773` added browser-visible retrieval diagnostics. UX-02 is DONE / MERGED.
