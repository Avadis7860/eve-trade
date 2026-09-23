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
| Market PARTIAL | Usable page/order data remains visible; market health is PARTIAL | PENDING after PARTIAL-vs-ERROR fix |
| Existing market snapshot followed by fetch failure | Previous market context remains visible as STALE and carries the latest failure | PENDING after explicit-refresh serialization fix |
| Order detail | Ownership, observation, expected remaining result and decision context are visible | PASS via UX-02 browser suite |
| Projected vs realized values | Remaining sell value is labeled projected; Operations does not claim realized P&L | Covered by typecheck + detail implementation |

## Invariants

- ERROR / UNKNOWN are not converted into an empty business collection.
- LIVE, CACHE, STALE, PARTIAL, ERROR and UNKNOWN remain distinct.
- Economic ownership remains authoritative; observer identity is separate.
- Remaining order value is operational exposure/projection, not realized financial outcome.
- Performance/Journal remains outside Operations.

## Remaining manual evidence

This deterministic browser suite does not replace target-PC real-CCP evidence. UX-01 target-PC status remains NOT ROOT-CAUSED until the required hub, timestamp, HTTP status, cache, pagination and ESI/rate-limit headers are captured on the affected PC.
