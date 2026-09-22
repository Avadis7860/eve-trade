# Local Runbook

Status: CURRENT
Scope: common diagnostics

## Backend health

Run the development server and inspect `/api/health`. A degraded catalogue state is distinct from an unhealthy backend.

## Catalog

Use `/api/types/status` and the catalogue manifest when diagnosing canonical catalog state.

## Persistence

Inspect IndexedDB schema version and object store availability before changing persistence code. Current version is 5 with 11 stores.

## ESI

Check HTTP status, Retry-After and ESI error-limit metadata rather than treating failures as empty collections.

## Auth

For SSO problems, verify callback state, session/refresh behavior and character credential isolation. Do not introduce environment-specific OAuth workarounds.
