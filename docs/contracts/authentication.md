# Authentication Contract

Status: IN PROGRESS
Owner: auth boundary
Implementation: `server/routes/auth.ts`, `server/utils/authUtils.ts`, `server/config/environment.ts`, `src/services/authService.ts`
Validation: security/API suites + `server/__tests__/auth_token_validation.test.ts`

## Purpose

Maintain EVE SSO v2 Authorization Code authentication and character-scoped credentials without trusting unverified browser or JWT claims.

## Contract shape

The client secret remains server-side. The browser returns to the registered callback with an authorization code and state; the server validates and consumes the state, exchanges the code at the EVE SSO token endpoint, verifies the returned JWT, and only then exposes the validated session to the browser.

CCP's official SSO documentation is the authority for the OAuth/JWT contract: https://developers.eveonline.com/docs/services/sso/.

## Semantic rules

- OAuth state is random, single-use, TTL-bound and bound to the selected redirect URI.
- EVE access-token JWTs are accepted only after signature verification against the JWKS advertised by CCP's SSO metadata, then issuer, audience and expiration validation.
- The JWT subject must use the EVE character form `CHARACTER:EVE:<character-id>`.
- Character credentials are never interchangeable.
- Raw authorization codes and OAuth state are not forwarded to the frontend for a second exchange.
- Callback documents are `no-store` and `no-referrer`.

## ESI relationship

Authenticated ESI calls use the validated EVE SSO access token and send `X-Compatibility-Date`. The production transport uses the ESI root endpoint and does not rely on the legacy `/latest` URL prefix.

CCP references:
- https://developers.eveonline.com/docs/services/esi/overview/
- https://developers.eveonline.com/blog/changing-versions-v42-was-getting-out-of-hand/

## Failure semantics

Invalid state, JWT signature/issuer/audience/expiration failures, unauthorized credentials, expired/revoked tokens and upstream failures remain explicit error states.

[Character isolation](../invariants/character-isolation.md) · [Security](../architecture/security-boundary.md)
