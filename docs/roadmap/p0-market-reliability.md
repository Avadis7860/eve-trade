# P0 — Market / ESI Reliability

Status: HISTORICAL SUMMARY
Scope: durable closure outcome and retained diagnostic principles
Execution source: GitHub Issues / Pull Requests
Historical execution: [archived P0 record](../archive/roadmaps/p0-market-reliability.md)

## Durable outcome

The P0 market/ESI reliability gate is CLOSED / EXTERNALLY BOUNDED.

The repository-side market path now preserves explicit health and diagnostic information, including HTTP/cache/ESI rate-limit conditions, and browser validation covers the relevant failure states.

The previously reported target-PC market-display symptom is no longer an active repository incident. The current application was confirmed functional; the reported symptom was explained by insufficient available data to produce a market display. No persistent application defect is currently identified.

## Durable principles

- market acquisition failures remain explicit and do not become ordinary empty business state;
- ERROR, PARTIAL, STALE and UNKNOWN remain distinct;
- diagnostics must remain traceable to the source response;
- historical incident evidence is diagnostic material, not current product state.

## Current ownership

There is no active P0 execution plan.

Future market/ESI changes belong to dedicated GitHub Issues and must start from the current `main` state. The detailed P0-A through P0-D execution record is retained in the archive for historical evidence.
