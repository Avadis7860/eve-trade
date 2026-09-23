# P0 — Market / ESI Reliability Closure Plan

Status: ACTIVE / CLOSING
Owner: UX-01 / market reliability
Base: main `72c049042a3e3bd735117bac43c3dfe71827f79d`

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

Inventory every public market-order consumer outside Operations.

For each caller, prove that:
- `ERROR` is not converted to `[]` or an ordinary empty state;
- `PARTIAL` retains usable observations and a degraded state;
- `STALE` retains the last valid snapshot when available;
- `UNKNOWN` does not authorize a recommendation;
- refresh retries are observable.

Output:
a caller matrix with path, fallback behavior, test coverage and status.

### P0-B — Rate-limit regression

Extend deterministic browser coverage to HTTP 429.

Expected proof:
- market health is `ERROR`;
- active orders remain visible;
- HTTP 429 is shown;
- Retry-After is shown;
- ESI budget metadata is shown;
- no false empty market state is produced.

No claim about real CCP behavior is inferred from the mock; this is a deterministic contract test.

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

## Delivery discipline

- One active delivery branch and one active PR at a time.
- Every technical branch starts from current `main`.
- Merged branches are never reused.
- Each increment closes with deterministic tests and documentation evidence.
- The next increment starts only after the current PR is green and merged.
