# P0 — Market / ESI Reliability Closure Plan

Status: ACTIVE / CLOSING
Owner: UX-01 / market reliability
Base: main `18e1556a4b00331b1089b98a060bbdc2b78030ad`

## Objective

Close the market/ESI reliability gate without inventing a root cause for the reported target-PC incident.

The goal is to make every repository-side failure path explicit, preserve the canonical data-health vocabulary, and produce enough evidence to classify the external incident.

## Already completed

### 1. Global sync failure accounting

`GlobalMarketSyncService` now treats market quality `ERROR` as a failed sync item and carries its error count into global progress.

Invariant preserved:
- `PARTIAL` is degraded success;
- `ERROR` is not success;
- no technical failure becomes an ordinary empty market result.

### 2. HTTP / ESI diagnostics propagation

The public market-order backend route now forwards ESI pagination, cache, error-budget and Retry-After metadata even when the upstream request fails.

This keeps the original HTTP outcome and diagnostics available to the frontend without changing market semantics.

### 3. Browser diagnostic certification

PR #63 / CI #698 certifies:
- canonical market `ERROR`;
- active orders remain visible;
- HTTP 401 is visible;
- cache MISS is visible;
- ESI error-budget metadata is visible.

SDE Truth Gate #459 is also green.

## Remaining increments

### P0-A — Caller audit

**Audit result: COMPLETE on `audit/p0-market-consumers`; documentation-only.**

Every production consumer of the public market-order route outside Operations was mapped in [P0-A caller matrix](../validation/p0-a-market-consumers.md).

The audit found no concrete non-Operations production path that currently converts an HTTP/ESI market failure into a certifiable ordinary empty market. `ERROR`, `PARTIAL`, `STALE` and `UNKNOWN` remain explicit through the audited consumer chains.

No production code correction is justified by P0-A alone.

One latent API hazard remains: the legacy `EsiService.fetchLiveOrders()` helper returns only the order array and discards the quality envelope. No production caller was found; it must not be reused for business decisions without explicit failure semantics.

The increment is considered complete only after this documentation is merged with the single P0-A PR and the required CI gate is green.

### P0-B — Rate-limit regression

**Implementation: complete on `test/p0-market-429-retry-after`; CI certification pending.**

Deterministic browser coverage now asserts:
- the browser receives HTTP 429 on the controlled market-order request;
- market health is `ERROR`;
- active orders remain visible;
- HTTP 429 is shown;
- the accessible market-health diagnostics expose `cache MISS`, ESI budget `91` and `retry 7s`;
- the false empty-state message is absent.

The existing E2E harness supplies `Retry-After: 7`, `X-ESI-Error-Limit-Remain: 91`, `X-ESI-Error-Limit-Reset: 42` and a deterministic cache/pagination envelope. No claim about real CCP behavior is inferred from the mock.

Validation details: [P0-B 429 / Retry-After](../validation/p0-b-429-retry-after.md).

The increment is considered complete only after the single PR is CI-certified, merged, and followed by a green Main Smoke.

### P0-C — Target-PC evidence bundle

Capture on the affected PC, against real CCP/ESI:
- UTC timestamp;
- affected hub/region and type;
- request URL/path;
- HTTP status;
- cache status;
- pagination headers;
- ESI error-limit remaining/reset;
- Retry-After when present;
- whether the same request succeeds from a controlled comparison environment;
- application/browser/OS context sufficient to reproduce the failure.

The repository does not currently contain this real-PC evidence, so the incident remains NOT ROOT-CAUSED.

### P0-D — Close or externally bound the incident

Two acceptable closure states:
- **ROOT-CAUSED:** a reproducible technical cause is demonstrated and fixed/contained;
- **EXTERNALLY BOUNDED:** repository-side path is certified, the remaining dependency is explicitly outside repository control, and the evidence request is documented.

Do not substitute a hypothesis for either state.

## Sequence after P0

Once P0 is closed, the next implementation order is:

1. UX-03 Allocation / Portefeuille.
2. UX-04 Performance / Journal.
3. UX-05 Control Center / Paramètres.
4. UX-06 Cockpit after the three upstream contracts are stable.
5. UX-07 responsive/accessibility hardening across the resulting workflows.

Before UX-03 implementation, freeze the contracts for Allocation, Performance and Control Center so the implementations share the same vocabulary for capital, provenance, projected vs realized values, health and refresh.

## CI operator tooling dependency

The P0 closure does not depend on Oclif. Oclif is documented as a **future CI operator-layer candidate**, not as a P0 implementation requirement.

The intended future boundary is:
- GitHub Actions remains the certification authority;
- gh remains the low-level GitHub control interface;
- Oclif may later encode the repository's procedural delivery checks as a project CLI.

Do not introduce this tooling inside P0-B. Any implementation starts as a separate maintenance chantier after P0 closure unless a narrowly scoped CI-hardening decision explicitly opens it earlier.

## Delivery discipline

- One active delivery branch and one active PR at a time.
- Every technical branch starts from current `main`.
- Merged branches are never reused.
- Each increment closes with deterministic tests and documentation evidence.
- The next increment starts only after the current PR is green and merged.
