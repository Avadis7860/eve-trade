# ADR — E2E-001 Controlled External Boundaries and Browser OAuth Trust

Status: Accepted
Scope: deterministic browser E2E for OAuth/ESI integration
Date: 2026-09-23

## Decision

E2E-001 keeps the production authentication and ESI architecture intact and controls only the external OAuth/ESI boundaries required for deterministic browser execution.

The application accepts configurable upstream URLs through environment variables:

- `EVE_SSO_AUTHORIZE_URL`
- `EVE_SSO_TOKEN_URL`
- `EVE_SSO_VERIFY_URL`
- `ESI_BASE_URL`

When unset, the defaults remain the official CCP EVE SSO and ESI endpoints.

The Playwright harness starts a separate deterministic fixture before the application server is loaded. The browser still executes the real `SsoConnectCard`, real popup navigation, real `/auth/callback`, real `postMessage`, real session persistence, real frontend authenticated API requests, real character/corporation route composition, and the existing gateway stack.

## Browser callback trust

OAuth callback messages are accepted only when:

1. the message origin equals the current application origin; and
2. the message source is the popup recorded for the active SSO attempt.

The callback no longer uses a wildcard `postMessage` fallback.

## Alternatives rejected

### Process-global ESI mock alone

The existing `setGlobalEsiMock` facility is appropriate for server/unit tests but cannot prove a real browser → backend → gateway → transport composition. It therefore remains available for lower-level tests but is not the E2E boundary mechanism.

### Browser interception of internal application API routes

Intercepting `/api/auth/*` or `/api/character/*` inside Playwright would bypass the application layers E2E-001 is intended to prove. Browser interception is therefore limited to controlled mutation of the external fixture selection in tests, not substitution of application endpoints.

### Real CCP in CI

A real CCP account would make the CI gate non-deterministic, credential-dependent and interactive. The CI/browser proof therefore uses only disposable deterministic fixtures. Real CCP is validated by a separate local smoke test.

## Consequences

Production defaults remain unchanged. Local deterministic tests require no CCP credentials. The real CCP smoke procedure remains an operator-controlled acceptance step after local installation.
