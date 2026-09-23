# Current Chunk

Status: ACTIVE
Scope: P0 — Market / ESI retrieval observability and reliability
Reference: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Program: [UX-First Trading Terminal Program](ux-program.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)
Detailed plan: [P0 Market Reliability Plan](p0-market-reliability.md)

## Objective

Close the remaining P0 market/ESI retrieval reliability gate while preserving canonical data truth and producing reproducible evidence for the target-PC incident.

## Completed increments

- Global synchronization now classifies market-quality `ERROR` as a failed item and carries its error count into the global sync result.
- Market API error responses now preserve HTTP, cache, ESI error-budget and Retry-After metadata.
- Browser Operations proof now certifies canonical ERROR state, active-order retention and operator-facing HTTP/budget diagnostics.
- CI Foundation & Regression Gate #698 and Phase 2.7C SDE Truth Gate #459 are green on main after PR #63.

## P0-A audit result

P0-A is **AUDIT COMPLETE / DOCUMENTATION-ONLY** on branch `audit/p0-market-consumers`.

The [caller matrix](../validation/p0-a-market-consumers.md) maps the direct route caller and every non-Operations production consumer found in the repository. No concrete failure-to-empty or failure-to-unchanged collapse affecting certifiable business truth was demonstrated.

No production code change is required by P0-A. The legacy `EsiService.fetchLiveOrders()` helper is recorded as a latent quality-loss hazard but has no production caller and is not reused.

## Next increments

1. Add deterministic browser coverage for HTTP 429 with Retry-After and ESI budget metadata.
2. Execute/capture the real target-PC evidence bundle: affected hub, UTC timestamp, request/status, cache/pagination headers, ESI error-budget headers, Retry-After where present, and whether the same request succeeds from a controlled comparison environment.
3. Close UX-01 as either **ROOT-CAUSED** (reproducible technical cause) or **EXTERNALLY BOUNDED** (code path certified; remaining evidence dependency explicitly outside the repository).

## Scope discipline

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 remain deferred.

UX-02 is DONE / MERGED and is not an active branch.

## Validation

P0 closes only when:
- failure paths that can affect business truth are explicit and covered;
- ERROR / PARTIAL / STALE / UNKNOWN remain distinct;
- deterministic 429/rate-limit diagnostics are covered;
- the target-PC incident has either a reproducible root cause or a documented external evidence boundary;
- roadmap/backlog/current-state are synchronized;
- the P0-A caller matrix remains linked to the merged state.
