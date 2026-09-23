# Current Chunk

Status: ACTIVE
Scope: P0 — Market / ESI retrieval observability and reliability
Reference: [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
Program: [UX-First Trading Terminal Program](ux-program.md)
Decision: [ADR-0002](../decisions/ADR-0002-ux-first-trading-terminal.md)

## Objective

Close the remaining P0 market/ESI retrieval reliability gate while preserving canonical data truth and producing reproducible evidence for the target-PC incident.

## Current increment

- Inspect public market-order acquisition error propagation across EsiService → MarketEsiGateway → EsiGateway → UI consumers.
- Identify concrete callers that still collapse fetch failures into empty/unchanged business data.
- Preserve explicit LIVE / CACHE / STALE / PARTIAL / ERROR / UNKNOWN semantics.
- Add deterministic regression coverage for affected failure paths.
- Produce the evidence needed to narrow the target-PC incident without speculative provider/transport changes.

The UX-02 Operations decision loop is already merged and certified by PR #61 run `35859213922`.

## Scope discipline

PST-001, UI-001, E2E-002, UI-002, PERF-001 and TYPE-001 remain deferred.

UX-01 technical implementation is merged and provides the shared market-data truth primitives, but the target-PC market-order incident remains NOT ROOT-CAUSED until the required PC evidence is captured.


## Validation

P0 is complete when the remaining market retrieval failure paths are explicitly observable, deterministic regression coverage exists, and the target-PC diagnosis has either a reproducible root cause or a clearly bounded external evidence requirement.

