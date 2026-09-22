# Authentication Contract

Status: STABLE
Owner: auth boundary
Implementation: `server/routes/auth.ts`, `server/utils/authUtils.ts`, `src/services/authService.ts`
Validation: `server/__tests__/security_hardening.test.ts`, API tests

## Purpose

Maintain secure EVE SSO v2 authentication and character-scoped credentials.

## Contract shape

Sessions are associated with a character identity and token lifecycle. OAuth callback validation uses a cryptographic `state` and rejects replay.

## Semantic rules

Character credentials are never interchangeable. Authenticated character routes require a Bearer credential. Refresh operations are coordinated to avoid concurrent token invalidation races.

## Failure semantics

Invalid state, unauthorized credentials, expired/revoked tokens and upstream failures remain explicit HTTP/error states.

[Character isolation](../invariants/character-isolation.md) · [Security](../architecture/security-boundary.md)
