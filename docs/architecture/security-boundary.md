# Security Boundary

Status: IN PROGRESS
Scope: authentication, credentials and private-data boundaries
Source of truth: `server/routes/auth.ts`, `server/utils/authUtils.ts`, `server/utils/esiGateway.ts`, character gateways/routes
Tests: security + EVE SSO JWT validation + ESI/API suites
CI gate: security + EVE SSO JWT validation + ESI

## Rules

OAuth state is cryptographically random, single-use, TTL-bound and bound to the selected redirect URI.

EVE access-token claims are never trusted merely because they parse as JWT JSON. The server verifies the JWT signature against the JWKS advertised by the EVE SSO metadata endpoint, then validates issuer, audience, expiration and EVE character subject format.

Browser OAuth callback messages are accepted only when they originate from the application origin and the popup window opened for the active SSO attempt. The callback never falls back to wildcard `postMessage`.

OAuth callback HTML is explicitly non-cacheable and sends no referrer because it contains the validated token handoff.

Private ESI request coalescing is partitioned by principal and credential fingerprint. Public market data remains owner-neutral.

Corporation access is authorized through the observing character; corporation identity does not replace the character credential.

ESI transport uses the root ESI endpoint plus `X-Compatibility-Date`; the production contract does not use the legacy `/latest` prefix.
