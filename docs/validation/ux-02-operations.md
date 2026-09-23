# UX-02 — Operations / Mes Ordres Validation

Status: ACTIVE — CLOSE OPERATIONS GATE
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
| Order detail | Ownership, observation, expected remaining result and decision context are visible | PASS via UX-02 browser suite |
| Projected vs realized values | Remaining sell value is labeled projected; Operations does not claim realized P&L | Covered by typecheck + detail implementation |
| KEEP | Active order is visibly classified as `Conserver`; detail exposes the keep rationale | Pending current-branch browser run |
| ADJUST | Active order is visibly classified as `Ajuster`; detail exposes the target price rationale | Pending current-branch browser run |
| RELOCATE | Active order is visibly classified as `Déplacer`; detail exposes the destination hub and economics | Pending current-branch browser run |
| CANCEL | Active order is visibly classified as `Annuler`; detail exposes the cancellation rationale | Pending current-branch browser run |

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
The degraded-data recommendation gate is enforced by `FailureSemantics.isActionable()`. The current branch adds deterministic browser fixtures for all four decision outcomes; this matrix will be promoted to PASS only from the current branch's CI evidence.
