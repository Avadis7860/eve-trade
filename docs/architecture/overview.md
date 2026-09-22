# Architecture Overview

Status: STABLE
Scope: system-level topology
Source of truth: repository tree and current imports
Implementation: `src/`, `server/`, `server.ts`
Tests: [../validation/regression-matrix.md](../validation/regression-matrix.md)
CI gate: [../validation/ci.md](../validation/ci.md)

## Layers

```
React/Vite UI
  ↓
hooks / application services
  ↓
domain repositories + pure engines
  ↓
IndexedDB and backend API
  ↓
Express routes / ESI gateways / ESI client
```

## Rules

Frontend business consumers do not bypass the typed service boundaries. Backend ESI access is centralized in `server/utils/esiClient.ts` and gateway classes.

Canonical catalogue and universe data are validated before being treated as trusted. Trading ownership and order identity are represented explicitly.

## Navigation

[Frontend](frontend.md) · [Backend](backend.md) · [Services](services.md) · [Persistence](persistence.md) · [ESI boundary](esi-boundary.md) · [Data flow](data-flow.md) · [Security](security-boundary.md)
