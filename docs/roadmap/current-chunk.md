# Current Chunk

Status: UX-03 IMPLEMENTATION INCREMENT 1 ACTIVE
Scope: UX-03 contract enrichment + public-readiness maintenance follow-up
Reference: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Program: [UX-First Trading Terminal Program](ux-program.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)
Detailed plan: [UX-First Trading Terminal Program](ux-program.md)
Detailed contract: [UX-03 Allocation / Portefeuille — Contrat métier détaillé](../ux/ux-03-allocation-contract.md)
Data traceability: [UX-03 Data Availability & Derivation Matrix](../validation/ux-03-data-availability.md)
Public-readiness audit: [Public Readiness Audit](../audits/public-readiness-audit-2026-09-24.md)

## Objective

Deliver UX-03 Allocation / Portefeuille incrementally without losing the verified state of the repository. P0/UX-01 is closed; UX-03 is now the active product build. Public-readiness hardening is tracked separately and is not an active implementation branch.

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

## P0-C certification result

P0-C implementation is **DONE / MERGED / CERTIFIED** on main by PR #67 at merge commit `31308676ec2d9104f7c6ffab29dae1e3f4f49a00`.

The target-PC evidence workflow now includes a browser-visible JSON export containing the market request template, per-hub HTTP/cache/pagination/ESI/Retry-After diagnostics, data-health state, timestamp and non-secret browser context. PR CI #719, SDE #480, and post-merge Main Smoke #8 are green. The exported bundle deliberately records the controlled comparison result as `not_recorded`; that field must be established from the affected PC and a controlled comparison environment. Validation: [P0-C target-PC evidence](../validation/p0-c-target-pc-evidence.md).

## UX-03 increment 1 evidence

- Portfolio aggregation boundary added for treasury, scoped order exposure, candidate universe and Real/Proposed snapshots.
- Portfolio optimizer now consumes the cross-item universe with explicit hard gates, deployed-capital concentration and safe quantity/capital arithmetic.
- Portfolio UI now separates observed portfolio state from proposed allocation and preserves prior reliable proposals across blocked refresh states.
- UX-03 domain and browser coverage is included in CI; current CI validation has passed typecheck, build, unit/domain certification and Operations browser E2E.

## Next increments

1. Complete UX-03 surface certification, including the final browser surface assertions and review of rationale/coverage/freshness presentation.
2. Synchronize the UX-03 acceptance evidence after that certification.
3. Address public-readiness maintenance items PUB-002/PUB-003 before the first portfolio showcase release.
4. Keep the public-readiness audit synchronized with any material change in capabilities, security posture or release state.

## Public-readiness status

PUB-001 and PUB-007 are being closed by the current documentation/state synchronization. PUB-002 and PUB-003 remain high-priority maintenance decisions before portfolio publication.

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

UX-03 increment 1 is active on `ux-03/allocation-contract`. The branch contains product implementation and tests; it must not be merged as a documentation-only change.

## Validation

P0 closure evidence is complete:
- failure paths that affect business truth are explicit and covered;
- ERROR / PARTIAL / STALE / UNKNOWN remain distinct;
- deterministic 429/rate-limit diagnostics are covered;
- the historical target-PC symptom is resolved and externally bounded;
- roadmap/backlog/current-state are synchronized;
- the P0-A caller matrix remains linked to the merged state.
