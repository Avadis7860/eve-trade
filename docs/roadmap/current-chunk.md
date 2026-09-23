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

## P0-B certification result

P0-B is **DONE / MERGED / CERTIFIED** on main by PR #66 at merge commit `c0ddc69ef424ed0cfd4de776758166c3ee8c1abe`.

The [deterministic 429 proof](../validation/p0-b-429-retry-after.md) certified HTTP 429, `ERROR`, active-order retention, visible HTTP status, ESI budget, Retry-After and absence of a false empty state. PR CI and post-merge Main Smoke were green.

## P0-C implementation result

P0-C is **ACTIVE** on branch `feat/p0-target-pc-evidence`, based on main at `c0ddc69ef424ed0cfd4de776758166c3ee8c1abe`.

The target-PC evidence workflow now includes a browser-visible JSON export containing the market request template, per-hub HTTP/cache/pagination/ESI/Retry-After diagnostics, data-health state, timestamp and non-secret browser context. The exported bundle deliberately records the controlled comparison result as `not_recorded`; that field must be established from the affected PC and a controlled comparison environment.

## Next increments

1. Validate and merge the P0-C evidence-export increment.
2. Run the exported evidence capture on the affected PC and from a controlled comparison environment, then classify the incident.
3. Close UX-01 as either **ROOT-CAUSED** (reproducible technical cause) or **EXTERNALLY BOUNDED** (code path certified; remaining evidence dependency explicitly outside the repository).

## CI operator tooling — planned, not active

Oclif is recorded as a future operator-layer track for repository/CI operations. It is **not part of P0-B** and must not become a new parallel chantier.

Planned role:
- GitHub Actions remains the authoritative CI/certification system;
- GitHub CLI (gh) remains the low-level GitHub control surface;
- an Oclif-based project CLI may later expose a small operator workflow such as `eve ci status`, `eve ci watch`, `eve ci rerun-failed` and `eve ci certify`;
- project-specific rules stay in testable domain functions rather than being hidden inside the CLI.

Activation gate: only after the P0 closure gate is complete, unless a separate CI-hardening decision explicitly justifies a narrow operator-tooling increment. Implementation must use a new branch/PR and must not be folded into the current P0-B certification.

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
